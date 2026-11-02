// Aktuelle Werte und 5-Minuten-Verläufe aus dem weewx-Archiv.
// Ausgabe immer in Anzeigeeinheiten (°C, hPa, mm, km/h), siehe units.js.
import { weewx } from './db.js';
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
const stFirst = weewx.prepare('SELECT MIN(dateTime) AS t FROM archive');
const stSunCandidates = weewx.prepare(`SELECT dateTime, radiation FROM archive
  WHERE dateTime > ? AND radiation > 40 ORDER BY dateTime DESC`);

const qLatest = () => { const r = stLatest.get(); return r && toDisplay(r); };
const qAt = (t) => { const r = stAt.get(t); return r && toDisplay(r); };
const qRange = (from, to) => stRange.all(from, to).map(toDisplay);

// --- Helfer für 5-Minuten-Datensätze ----------------------------------------------

function extreme(rows, key, pick) {
  let best = null;
  for (const r of rows) {
    const v = r[key];
    if (v != null && (best == null || pick(v, best.value))) {
      best = { value: v, time: r.dateTime };
    }
  }
  return best;
}
const max = (rows, key) => extreme(rows, key, (a, b) => a > b);
const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] ?? 0), 0);
const avg = (rows, key) => {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

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
  return seriesRange(last.dateTime - hours * 3600, last.dateTime);
}

/** 5-Minuten-Verlauf im Zeitraum (from, to] plus Regensummen je Stunde */
export function seriesRange(from, to) {
  const rows = qRange(from, to);
  const hours = Math.ceil((to - from) / 3600);
  const now = to;

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

/** Zeitraum des Archivs: erster und letzter Datensatz (Unix-Zeit) */
export function archiveSpan() {
  return { first: stFirst.get()?.t ?? null, last: stLatest.get()?.dateTime ?? null };
}
