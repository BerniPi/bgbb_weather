// Statistik über ganze Tage aus den weewx-Tageszusammenfassungen (archive_day_*).
// weewx führt dort Min/Max mit Zeitpunkt aus den Einzelmessungen (alle paar Sekunden),
// nicht aus den 5-Minuten-Mitteln – genauer und für lange Zeiträume viel schneller.
import { weewx } from './db.js';
import { sunshinePercent } from './sunshine.js';
import { toDisplay } from './units.js';

const usUnits = weewx.prepare('SELECT usUnits FROM archive ORDER BY dateTime DESC LIMIT 1').get()?.usUnits ?? 1;

/** Wert eines Tageszusammenfassungs-Feldes in Anzeigeeinheiten */
export function convert(obs, value) {
  if (value == null) return null;
  const key = obs === 'wind' ? 'windGust' : obs;
  return toDisplay({ usUnits, [key]: value })[key];
}

const cache = new Map();
export function prepared(sql) {
  if (!cache.has(sql)) cache.set(sql, weewx.prepare(sql));
  return cache.get(sql);
}

function maxOf(obs, from, to, extra = '') {
  const r = prepared(`SELECT max, maxtime${extra} FROM archive_day_${obs}
    WHERE dateTime >= ? AND dateTime <= ? AND max IS NOT NULL ORDER BY max DESC LIMIT 1`).get(from, to);
  return r ? { value: convert(obs, r.max), time: r.maxtime, ...(extra ? { dir: r.max_dir } : {}) } : null;
}

function minOf(obs, from, to) {
  const r = prepared(`SELECT min, mintime FROM archive_day_${obs}
    WHERE dateTime >= ? AND dateTime <= ? AND min IS NOT NULL ORDER BY min ASC LIMIT 1`).get(from, to);
  return r ? { value: convert(obs, r.min), time: r.mintime } : null;
}

function totals(obs, from, to) {
  return prepared(`SELECT SUM(sum) AS sum, SUM(wsum) AS wsum, SUM(sumtime) AS sumtime
    FROM archive_day_${obs} WHERE dateTime >= ? AND dateTime <= ?`).get(from, to);
}

const avgOf = (obs, from, to) => {
  const t = totals(obs, from, to);
  return t?.sumtime ? convert(obs, t.wsum / t.sumtime) : null;
};

const stDirAt = weewx.prepare('SELECT windDir FROM archive WHERE dateTime >= ? ORDER BY dateTime LIMIT 1');
const stSun = weewx.prepare('SELECT dateTime, interval, radiation FROM archive WHERE dateTime > ? AND dateTime <= ? AND radiation > 40');

/** Sonnenscheinminuten je Tag; dayStarts aufsteigend sortiert */
export function sunshineByDay(dayStarts, end) {
  const minutes = new Array(dayStarts.length).fill(0);
  let i = 0;
  for (const r of stSun.iterate(dayStarts[0], end)) {
    while (i + 1 < dayStarts.length && r.dateTime > dayStarts[i + 1]) i++;
    if (sunshinePercent(r.dateTime, r.radiation) > 0) minutes[i] += r.interval;
  }
  return minutes;
}

/**
 * Statistik für die Tage [firstDay, lastDay] (jeweils Tagesbeginn als Unix-Zeit)
 * `until` begrenzt die Sonnenscheindauer auf den aktuellen Zeitpunkt.
 */
export function statsDays(firstDay, lastDay, until = lastDay + 86400) {
  const windSpeedMax = maxOf('windSpeed', firstDay, lastDay);
  if (windSpeedMax) windSpeedMax.dir = stDirAt.get(windSpeedMax.time)?.windDir ?? null;
  const rain = totals('rain', firstDay, lastDay);
  if (rain?.sum == null && !maxOf('outTemp', firstDay, lastDay)) return null;

  return {
    outTempMax: maxOf('outTemp', firstDay, lastDay),
    outTempMin: minOf('outTemp', firstDay, lastDay),
    outTempAvg: avgOf('outTemp', firstDay, lastDay),
    heatindexMax: maxOf('heatindex', firstDay, lastDay),
    windchillMin: minOf('windchill', firstDay, lastDay),
    dewpointMax: maxOf('dewpoint', firstDay, lastDay),
    dewpointMin: minOf('dewpoint', firstDay, lastDay),
    outHumidityMax: maxOf('outHumidity', firstDay, lastDay),
    outHumidityMin: minOf('outHumidity', firstDay, lastDay),
    barometerMax: maxOf('barometer', firstDay, lastDay),
    barometerMin: minOf('barometer', firstDay, lastDay),
    windSpeedMax,
    windSpeedAvg: avgOf('windSpeed', firstDay, lastDay),
    windGustMax: maxOf('wind', firstDay, lastDay, ', max_dir'),
    rain: convert('rain', rain?.sum ?? 0),
    rainRateMax: maxOf('rainRate', firstDay, lastDay),
    UVMax: maxOf('UV', firstDay, lastDay),
    radiationMax: maxOf('radiation', firstDay, lastDay),
    sunshineMinutes: sunshineByDay([firstDay], Math.min(until, lastDay + 86400))[0],
  };
}
