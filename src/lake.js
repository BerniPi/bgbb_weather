// Bodensee (Pegel Bregenz): Speichern der VoWIS-Daten und alle Abfragen auf see_*
import { app, getStatus, setStatus } from './db.js';
import { localDate, localToUnix } from './time.js';

// Bekannte Kennwerte Pegel Bregenz, falls der Abruf noch nicht gelaufen ist
const FLOOD_DEFAULT = { HW2: 460, HW10: 512, HW20: 531, HW30: 540, HW50: 553, HW100: 568 };

const insData = app.prepare('INSERT OR REPLACE INTO see_data VALUES (?, ?, ?, ?)');
const insDay = app.prepare('INSERT OR REPLACE INTO see_days VALUES (?, ?, ?, ?)');
const insHist = app.prepare('INSERT OR REPLACE INTO see_hist VALUES (?, ?, ?, ?)');

/** Antwort von vowis.vorarlberg.at/api/see speichern */
export function saveLake(see) {
  // Hochwasser-Kennwerte (Pegel in cm) für die Linien im Diagramm
  const flood = Object.fromEntries(['hW2', 'hW10', 'hW20', 'hW30', 'hW50', 'hW100']
    .filter((k) => see[k] != null).map((k) => [`HW${k.slice(2)}`, see[k]]));
  setStatus('see', { flood, nnw: see.nnw, hhw: see.hhw });

  const t = Math.floor(Date.parse(see.wasserstand.datum) / 1000);
  insData.run(t, see.wtMilli05?.wert ?? null, see.wtMilli25?.wert ?? null, see.wasserstand.wert);
  for (const d of see.seeArchiv ?? []) {
    const date = d.datum.slice(0, 10);
    insDay.run(date, d.wtMilli05 ?? null, d.wtMilli25 ?? null, d.w ?? null);
    insHist.run(date.slice(5), d.Min ?? null, d.Mit ?? null, d.Max ?? null);
  }
}

const qLatest = app.prepare('SELECT * FROM see_data ORDER BY dateTime DESC LIMIT 1');
const qDay = app.prepare('SELECT * FROM see_days WHERE date = ?');
const qHist = app.prepare('SELECT * FROM see_hist WHERE day = ?');
const qDays = app.prepare(`SELECT d.date, d.temp05, d.temp25, d.stand, h.stand_mit
  FROM see_days d LEFT JOIN see_hist h ON h.day = substr(d.date, 6)
  WHERE d.date >= ? AND d.date <= ? ORDER BY d.date`);

/** Aktuelle Werte mit Änderung zum Vortag, historischen Kennwerten und Vorjahr */
export function lakeNow() {
  const now = qLatest.get();
  if (!now) return null;
  const today = localDate(now.dateTime);
  const yesterday = qDay.get(localDate(localToUnix(today) - 43200));
  const lastYear = qDay.get(`${+today.slice(0, 4) - 1}${today.slice(4)}`);
  const hist = qHist.get(today.slice(5));
  const diff = (a, b) => (a != null && b != null ? a - b : null);
  return {
    time: now.dateTime,
    temp05: now.temp05,
    temp25: now.temp25,
    stand: now.stand,
    temp05Diff: diff(now.temp05, yesterday?.temp05),
    temp25Diff: diff(now.temp25, yesterday?.temp25),
    standDiff: diff(now.stand, yesterday?.stand),
    hist: hist ? { min: hist.stand_min, mean: hist.stand_mit, max: hist.stand_max } : null,
    lastYear: lastYear ? { temp05: lastYear.temp05, stand: lastYear.stand } : null,
  };
}

/** Tageswerte [from, to] (ISO-Daten) inkl. langjährigem Mittel des Pegels */
export function lakeDays(from, to) {
  return qDays.all(from, to).map((r) => ({ ...r, stand_mit: r.stand_mit == null ? null : Math.round(r.stand_mit) }));
}

/** Hochwasser-Kennwerte des Pegels (cm) */
export function floodLevels() {
  return getStatus('see')?.flood ?? FLOOD_DEFAULT;
}

/** Tageswerte plus Hochwasser-Kennwerte für das Diagramm */
export function lakeChart(from, to) {
  return { days: lakeDays(from, to), flood: floodLevels() };
}

const qHistAll = app.prepare('SELECT day, stand_min AS min, stand_mit AS mean, stand_max AS max FROM see_hist ORDER BY day');
const qYears = app.prepare("SELECT DISTINCT substr(date, 1, 4) AS y FROM see_days ORDER BY y");

/**
 * Daten der Bodensee-Seite für ein Jahr: Tageswerte des Jahres und des Vorjahres,
 * historischer Pegelbereich je Kalendertag, Kennwerte, Extremwerte im Jahr und insgesamt
 */
export function lakeYear(year) {
  const y = String(year);
  const days = lakeDays(`${y}-01-01`, `${y}-12-31`);
  const status = getStatus('see');
  return {
    year: Number(y),
    years: qYears.all().map((r) => Number(r.y)),
    days,
    previous: lakeDays(`${+y - 1}-01-01`, `${+y - 1}-12-31`),
    hist: qHistAll.all().map((r) => ({ ...r, mean: r.mean == null ? null : Math.round(r.mean) })),
    flood: floodLevels(),
    extremes: { lowest: status?.nnw ?? null, highest: status?.hhw ?? null },
    stats: lakeStats(days),
    allTime: lakeStats(lakeDays('1900-01-01', '2100-12-31')),
  };
}

/** Minimum und Maximum von Wassertemperatur und Pegel mit Datum */
export function lakeStats(days) {
  const pick = (key, better) => days.reduce((b, d) => (d[key] != null && (b == null || better(d[key], b[key])) ? d : b), null);
  const e = (d, key) => (d ? { value: d[key], date: d.date } : null);
  return {
    temp05Min: e(pick('temp05', (a, b) => a < b), 'temp05'),
    temp05Max: e(pick('temp05', (a, b) => a > b), 'temp05'),
    standMin: e(pick('stand', (a, b) => a < b), 'stand'),
    standMax: e(pick('stand', (a, b) => a > b), 'stand'),
  };
}
