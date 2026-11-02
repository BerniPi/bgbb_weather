// Abfragen auf das weewx-Archiv und die App-Tabellen.
// Ausgabe immer in Anzeigeeinheiten (°C, hPa, mm, km/h), siehe units.js.
import { weewx, app, getStatus } from './db.js';
import { sunshinePercent, isSunny } from './sunshine.js';
import { localDate, startOfLocalDay, localToUnix } from './time.js';
import { toDisplay } from './units.js';

const COLS = `dateTime, usUnits, interval, outTemp, dewpoint, outHumidity, barometer, pressure,
  windSpeed, windGust, windDir, rainRate, rain, radiation, UV`;

const stLatest = weewx.prepare(`SELECT ${COLS} FROM archive ORDER BY dateTime DESC LIMIT 1`);
const stRange = weewx.prepare(`SELECT ${COLS} FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime`);
const qLatest = { get: () => { const r = stLatest.get(); return r && toDisplay(r); } };
const qRange = { all: (from, to) => stRange.all(from, to).map(toDisplay) };

function extreme(rows, key, pick) {
  let best = null;
  for (const r of rows) {
    const v = r[key];
    if (v != null && (best == null || pick(v, best.value))) best = { value: v, time: r.dateTime };
  }
  return best;
}
const max = (rows, key) => extreme(rows, key, (a, b) => a > b);
const min = (rows, key) => extreme(rows, key, (a, b) => a < b);
const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);
const avg = (rows, key) => {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

function sunshineMinutes(rows) {
  return rows.reduce((m, r) => m + (sunshinePercent(r.dateTime, r.radiation) > 0 ? r.interval : 0), 0);
}

export function current() {
  const last = qLatest.get();
  if (!last) return null;
  const now = last.dateTime;
  const day = qRange.all(startOfLocalDay(now), now);
  const last10 = qRange.all(now - 600, now);
  const last24h = qRange.all(now - 86400, now);

  return {
    time: now,
    outTemp: last.outTemp,
    dewpoint: last.dewpoint,
    outHumidity: last.outHumidity,
    barometer: last.barometer,
    pressure: last.pressure,
    windSpeed: avg(last10, 'windSpeed'),
    windDir: last.windDir,
    windGust: max(last10, 'windGust')?.value ?? null,
    rainRate: last.rainRate,
    radiation: last.radiation,
    UV: last.UV,
    rain1h: sum(qRange.all(now - 3600, now), 'rain'),
    rain24h: sum(last24h, 'rain'),
    sunny: isSunny(now, last.radiation),
    today: {
      outTempMax: max(day, 'outTemp'),
      outTempMin: min(day, 'outTemp'),
      outHumidityMax: max(day, 'outHumidity'),
      outHumidityMin: min(day, 'outHumidity'),
      barometerMax: max(day, 'barometer'),
      barometerMin: min(day, 'barometer'),
      windGustMax: max(day, 'windGust'),
      rainRateMax: max(day, 'rainRate'),
      radiationMax: max(day, 'radiation'),
      rain: sum(day, 'rain'),
      sunshineMinutes: sunshineMinutes(day),
    },
  };
}

/** Verlauf der letzten `hours` Stunden plus stündliche Regensummen */
export function series(hours = 24) {
  const last = qLatest.get();
  if (!last) return { records: [], rainHourly: [] };
  const now = last.dateTime;
  const rows = qRange.all(now - hours * 3600, now);

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
const qSeeDays = app.prepare(`SELECT d.date, d.temp05, d.stand, h.stand_mit
  FROM see_days d LEFT JOIN see_hist h ON h.day = substr(d.date, 6)
  WHERE d.date > ? ORDER BY d.date`);

export function lake() {
  const now = qSeeLatest.get();
  if (!now) return null;
  const yesterday = qSeeDay.get(localDate(localToUnix(localDate(now.dateTime)) - 43200));
  const diff = (a, b) => (a != null && b != null ? a - b : null);
  return {
    time: now.dateTime,
    temp05: now.temp05,
    stand: now.stand,
    temp05Diff: diff(now.temp05, yesterday?.temp05),
    standDiff: diff(now.stand, yesterday?.stand),
  };
}

export function lakeSeries(days = 28) {
  const from = localDate(Math.floor(Date.now() / 1000) - days * 86400);
  return qSeeDays.all(from);
}

export function storm() {
  return getStatus('sturm');
}
