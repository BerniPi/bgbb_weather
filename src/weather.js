// Abfragen auf das weewx-Archiv und die App-Tabellen.
// Ausgabe immer in Anzeigeeinheiten (°C, hPa, mm, km/h), siehe units.js.
import { weewx, app, getStatus } from './db.js';
import { sunshinePercent, isSunny } from './sunshine.js';
import { localDate, startOfLocalDay, localToUnix } from './time.js';
import { toDisplay } from './units.js';
import { statsDays } from './summaries.js';

const COLS = `dateTime, usUnits, interval, outTemp, dewpoint, outHumidity, windchill, heatindex,
  barometer, pressure, windSpeed, windGust, windDir, windGustDir, rainRate, rain, radiation, UV`;

const stLatest = weewx.prepare(`SELECT ${COLS} FROM archive ORDER BY dateTime DESC LIMIT 1`);
const stRange = weewx.prepare(`SELECT ${COLS} FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime`);
const stAt = weewx.prepare(`SELECT ${COLS} FROM archive WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1`);
const stLastRain = weewx.prepare('SELECT dateTime FROM archive WHERE rain > 0 ORDER BY dateTime DESC LIMIT 1');
const stSunCandidates = weewx.prepare(`SELECT dateTime, radiation FROM archive
  WHERE dateTime > ? AND radiation > 40 ORDER BY dateTime DESC`);

const qLatest = () => { const r = stLatest.get(); return r && toDisplay(r); };
const qAt = (t) => { const r = stAt.get(t); return r && toDisplay(r); };
const qRange = (from, to) => stRange.all(from, to).map(toDisplay);

// --- Statistik-Helfer ----------------------------------------------------------

function extreme(rows, key, pick, dirKey) {
  let best = null;
  for (const r of rows) {
    const v = r[key];
    if (v != null && (best == null || pick(v, best.value))) {
      best = { value: v, time: r.dateTime };
      if (dirKey) best.dir = r[dirKey];
    }
  }
  return best;
}
const max = (rows, key, dirKey) => extreme(rows, key, (a, b) => a > b, dirKey);
const min = (rows, key) => extreme(rows, key, (a, b) => a < b);
const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);
const avg = (rows, key) => {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

function sunshineMinutes(rows) {
  return rows.reduce((m, r) => m + (sunshinePercent(r.dateTime, r.radiation) > 0 ? r.interval : 0), 0);
}

/** Extremwerte, Mittel und Summen über beliebige Datensätze (Tag, Woche, …) */
export function stats(rows) {
  if (!rows.length) return null;
  return {
    outTempMax: max(rows, 'outTemp'),
    outTempMin: min(rows, 'outTemp'),
    outTempAvg: avg(rows, 'outTemp'),
    heatindexMax: max(rows, 'heatindex'),
    windchillMin: min(rows, 'windchill'),
    dewpointMax: max(rows, 'dewpoint'),
    dewpointMin: min(rows, 'dewpoint'),
    outHumidityMax: max(rows, 'outHumidity'),
    outHumidityMin: min(rows, 'outHumidity'),
    barometerMax: max(rows, 'barometer'),
    barometerMin: min(rows, 'barometer'),
    windSpeedMax: max(rows, 'windSpeed', 'windDir'),
    windGustMax: max(rows, 'windGust', 'windGustDir'),
    rain: sum(rows, 'rain'),
    rainRateMax: max(rows, 'rainRate'),
    UVMax: max(rows, 'UV'),
    radiationMax: max(rows, 'radiation'),
    sunshineMinutes: sunshineMinutes(rows),
  };
}

function lastSunshine(now) {
  for (const r of stSunCandidates.iterate(now - 14 * 86400)) {
    if (sunshinePercent(r.dateTime, r.radiation) > 0) return r.dateTime;
  }
  return null;
}

/** Beginn des gleichen Kalendertags ein Jahr zuvor */
function sameDayLastYear(now) {
  const [y, m, d] = localDate(now).split('-');
  return localToUnix(`${+y - 1}-${m}-${d}`);
}

// --- Aktuelle Werte --------------------------------------------------------------

export function current() {
  const last = qLatest();
  if (!last) return null;
  const now = last.dateTime;
  const dayStart = startOfLocalDay(now);
  const last10 = qRange(now - 600, now);
  const before3h = qAt(now - 3 * 3600);
  const lyStart = sameDayLastYear(now);

  return {
    time: now,
    outTemp: last.outTemp,
    windchill: last.windchill,
    heatindex: last.heatindex,
    dewpoint: last.dewpoint,
    outHumidity: last.outHumidity,
    barometer: last.barometer,
    barometerTrend: before3h?.barometer != null && last.barometer != null ? last.barometer - before3h.barometer : null,
    pressure: last.pressure,
    windSpeed: avg(last10, 'windSpeed'),
    windDir: last.windDir,
    windGust: max(last10, 'windGust')?.value ?? null,
    rainRate: last.rainRate,
    radiation: last.radiation,
    UV: last.UV,
    rain1h: sum(qRange(now - 3600, now), 'rain'),
    rain24h: sum(qRange(now - 86400, now), 'rain'),
    lastRain: stLastRain.get()?.dateTime ?? null,
    lastSunshine: lastSunshine(now),
    sunny: isSunny(now, last.radiation),
    today: statsDays(dayStart, dayStart, now),
    lastYear: { date: localDate(lyStart), ...statsDays(lyStart, lyStart) },
  };
}

/** Verlauf der letzten `hours` Stunden plus stündliche Regensummen */
export function series(hours = 24) {
  const last = qLatest();
  if (!last) return { records: [], rainHourly: [] };
  const now = last.dateTime;
  const rows = qRange(now - hours * 3600, now);

  const records = rows.map((r) => ({
    t: r.dateTime,
    outTemp: r.outTemp,
    dewpoint: r.dewpoint,
    outHumidity: r.outHumidity,
    barometer: r.barometer,
    windSpeed: r.windSpeed,
    windGust: r.windGust,
    windDir: r.windSpeed > 0 || r.windGust > 0 ? r.windDir : null,
    radiation: r.radiation,
    sunshine: sunshinePercent(r.dateTime, r.radiation),
  }));

  // Datensätze tragen das Intervallende als Zeit → (t-1) ordnet sie der richtigen Stunde zu
  const firstHour = Math.floor((now - 1) / 3600) * 3600 - (hours - 1) * 3600;
  const rainHourly = Array.from({ length: hours }, (_, i) => ({ t: firstHour + i * 3600, rain: 0 }));
  for (const r of rows) {
    const i = (Math.floor((r.dateTime - 1) / 3600) * 3600 - firstHour) / 3600;
    if (i >= 0 && i < hours && r.rain) rainHourly[i].rain += r.rain;
  }
  return { records, rainHourly };
}

// --- Bodensee und Sturmwarnung ---------------------------------------------

const qSeeLatest = app.prepare('SELECT * FROM see_data ORDER BY dateTime DESC LIMIT 1');
const qSeeDay = app.prepare('SELECT * FROM see_days WHERE date = ?');
const qSeeHist = app.prepare('SELECT * FROM see_hist WHERE day = ?');
const qSeeDays = app.prepare(`SELECT d.date, d.temp05, d.stand, h.stand_mit
  FROM see_days d LEFT JOIN see_hist h ON h.day = substr(d.date, 6)
  WHERE d.date > ? ORDER BY d.date`);

export function lake() {
  const now = qSeeLatest.get();
  if (!now) return null;
  const today = localDate(now.dateTime);
  const yesterday = qSeeDay.get(localDate(localToUnix(today) - 43200));
  const lastYear = qSeeDay.get(`${+today.slice(0, 4) - 1}${today.slice(4)}`);
  const hist = qSeeHist.get(today.slice(5));
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

// Bekannte Kennwerte Pegel Bregenz, falls der Abruf noch nicht gelaufen ist
const FLOOD_DEFAULT = { HW2: 460, HW10: 512, HW20: 531, HW30: 540, HW50: 553, HW100: 568 };

export function lakeSeries(days = 28) {
  const from = localDate(Math.floor(Date.now() / 1000) - days * 86400);
  return { days: qSeeDays.all(from), flood: getStatus('see')?.flood ?? FLOOD_DEFAULT };
}

export function storm() {
  return getStatus('sturm');
}
