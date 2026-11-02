// Rohdaten (5 min) und Aggregate (Stunde, Tag, Monat, Jahr) für API, Export und Verlaufsseite.
// Alle Werte in Anzeigeeinheiten (°C, hPa, mm, km/h, W/m²).
import { weewx } from './db.js';
import { toDisplay } from './units.js';
import { sunshinePercent } from './sunshine.js';
import { convert, prepared, sunshineByDay } from './summaries.js';
import { isoLocal, localDate } from './time.js';

const ARCHIVE_COLUMNS = new Set(weewx.prepare('PRAGMA table_info(archive)').all().map((c) => c.name));
const DAY_TABLES = new Set(weewx.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'archive_day_%'")
  .all().map((r) => r.name.slice('archive_day_'.length)));

const round = (v, digits) => (v == null || Number.isNaN(v) ? null : Number(v.toFixed(digits)));
const vectorDir = (x, y) => (x || y ? (90 - (Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : null);

// --- Rohdaten -------------------------------------------------------------------

/** 5-Minuten-Werte im Zeitraum [from, to) als Zeilen { time, unix, <feld>: wert } */
export function archiveRows(from, to, fields) {
  const cols = fields.map((f) => f.key).filter((k) => ARCHIVE_COLUMNS.has(k));
  const needRadiation = fields.some((f) => f.key === 'sunshine') && !cols.includes('radiation');
  const select = ['dateTime', 'usUnits', 'interval', ...cols, ...(needRadiation ? ['radiation'] : [])];
  const st = prepared(`SELECT ${select.join(', ')} FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime`);

  return st.all(from, to).map((raw) => {
    const r = toDisplay(raw);
    const row = { time: isoLocal(r.dateTime), unix: r.dateTime };
    for (const f of fields) {
      row[f.key] = f.key === 'sunshine'
        ? (sunshinePercent(r.dateTime, r.radiation) > 0 ? r.interval : 0)
        : round(r[f.key], f.digits);
    }
    return row;
  });
}

export function archiveCount(from, to) {
  return prepared('SELECT COUNT(*) AS n FROM archive WHERE dateTime > ? AND dateTime <= ?').get(from, to).n;
}

// --- Aggregate --------------------------------------------------------------------

// Sammelt Werte eines Feldes in einem Intervall
function emptyAcc() {
  return { min: null, max: null, sum: 0, wsum: 0, wtime: 0, x: 0, y: 0, n: 0 };
}

function finish(acc, field) {
  const out = {};
  for (const agg of field.aggregates) {
    let v = null;
    if (acc.n) {
      if (agg === 'min') v = acc.min;
      else if (agg === 'max') v = acc.max;
      else if (agg === 'sum') v = acc.sum;
      else if (agg === 'avg') v = field.key === 'windDir' ? vectorDir(acc.x, acc.y) : (acc.wtime ? acc.wsum / acc.wtime : null);
    }
    out[`${field.key}_${agg}`] = round(v, field.key === 'sunshine' && agg === 'sum' ? 0 : field.digits);
  }
  return out;
}

/** Stundenwerte direkt aus den 5-Minuten-Daten */
function hourBuckets(from, to, fields) {
  const rows = archiveRows(from, to, [...fields, ...(fields.some((f) => f.key === 'windDir') ? [{ key: 'windSpeed', digits: 3 }] : [])]);
  const buckets = new Map();
  for (const r of rows) {
    const start = Math.floor((r.unix - 1) / 3600) * 3600; // Intervallende → Stunde davor
    if (!buckets.has(start)) buckets.set(start, new Map(fields.map((f) => [f.key, emptyAcc()])));
    const b = buckets.get(start);
    for (const f of fields) {
      const v = r[f.key];
      if (v == null) continue;
      const a = b.get(f.key);
      a.n++;
      a.min = a.min == null ? v : Math.min(a.min, v);
      a.max = a.max == null ? v : Math.max(a.max, v);
      a.sum += v;
      a.wsum += v * 300;
      a.wtime += 300;
      if (f.key === 'windDir' && r.windSpeed > 0) {
        a.x += r.windSpeed * Math.cos(((90 - v) * Math.PI) / 180);
        a.y += r.windSpeed * Math.sin(((90 - v) * Math.PI) / 180);
      }
    }
  }
  return [...buckets.entries()].map(([start, b]) => ({ start, accs: b }));
}

/** Tageswerte aus archive_day_* als Akkumulatoren (lassen sich zu Monat/Jahr zusammenfassen) */
function dayBuckets(firstDay, lastDay, end, fields) {
  // Tage mit Messdaten – unabhängig davon, welche Größen gewählt sind
  const days = new Map(prepared(`SELECT dateTime FROM archive_day_outTemp
    WHERE dateTime >= ? AND dateTime <= ? AND count > 0 ORDER BY dateTime`)
    .all(firstDay, lastDay)
    .map((r) => [r.dateTime, new Map(fields.map((f) => [f.key, emptyAcc()]))]));
  const ensure = (day) => days.get(day);

  for (const f of fields) {
    if (f.key === 'sunshine') continue;
    const table = f.key === 'windDir' ? 'wind' : f.key;
    if (!DAY_TABLES.has(table)) continue;
    const extra = f.key === 'windDir' ? ', xsum, ysum' : '';
    const st = prepared(`SELECT dateTime, min, max, sum, wsum, sumtime, count${extra} FROM archive_day_${table}
      WHERE dateTime >= ? AND dateTime <= ? AND count > 0 ORDER BY dateTime`);
    for (const r of st.iterate(firstDay, lastDay)) {
      const a = ensure(r.dateTime)?.get(f.key);
      if (!a) continue;
      a.n = r.count;
      if (f.key === 'windDir') {
        // Vektorsummen bleiben in Archiveinheiten – für die Richtung egal
        a.x = r.xsum;
        a.y = r.ysum;
        continue;
      }
      a.min = convert(f.key, r.min);
      a.max = convert(f.key, r.max);
      a.sum = f.key === 'rain' || f.key === 'ET' ? convert(f.key, r.sum) : r.sum;
      a.wsum = r.sumtime ? convert(f.key, r.wsum / r.sumtime) * r.sumtime : 0;
      a.wtime = r.sumtime;
    }
  }

  const starts = [...days.keys()].sort((a, b) => a - b);
  if (fields.some((f) => f.key === 'sunshine') && starts.length) {
    const minutes = sunshineByDay(starts, end);
    starts.forEach((d, i) => { Object.assign(days.get(d).get('sunshine'), { n: 1, sum: minutes[i] }); });
  }
  return starts.map((start) => ({ start, accs: days.get(start) }));
}

function merge(target, src) {
  if (!src.n) return;
  target.n += src.n;
  if (src.min != null) target.min = target.min == null ? src.min : Math.min(target.min, src.min);
  if (src.max != null) target.max = target.max == null ? src.max : Math.max(target.max, src.max);
  target.sum += src.sum;
  target.wsum += src.wsum;
  target.wtime += src.wtime;
  target.x += src.x;
  target.y += src.y;
}

const LABEL = {
  hour: (start) => isoLocal(start),
  day: (start) => localDate(start),
  month: (start) => localDate(start).slice(0, 7),
  year: (start) => localDate(start).slice(0, 4),
};

/**
 * Aggregierte Werte. interval: hour | day | month | year
 * firstDay/lastDay: Tagesbeginn (Unix) des ersten und letzten Tages, end: Ende (exklusiv)
 */
export function aggregateRows(interval, firstDay, lastDay, end, fields) {
  let buckets = interval === 'hour'
    ? hourBuckets(firstDay, end, fields)
    : dayBuckets(firstDay, lastDay, end, fields);

  if (interval === 'month' || interval === 'year') {
    const groups = new Map();
    for (const b of buckets) {
      const key = LABEL[interval](b.start);
      if (!groups.has(key)) groups.set(key, { start: b.start, accs: new Map(fields.map((f) => [f.key, emptyAcc()])) });
      const g = groups.get(key);
      for (const f of fields) merge(g.accs.get(f.key), b.accs.get(f.key));
    }
    buckets = [...groups.values()];
  }

  return buckets.map((b) => {
    const row = { time: LABEL[interval](b.start), unix: b.start };
    for (const f of fields) Object.assign(row, finish(b.accs.get(f.key), f));
    return row;
  });
}

/** Spaltenbeschreibung passend zu den Zeilen (für CSV-Kopf und Vorschau) */
export function columns(interval, fields) {
  const cols = [{ key: 'time', label: 'Zeit', unit: '' }, { key: 'unix', label: 'Unix-Zeit', unit: 's' }];
  for (const f of fields) {
    if (interval === 'raw') {
      cols.push({ key: f.key, label: f.label, unit: f.key === 'sunshine' ? 'min' : f.unit });
    } else {
      for (const agg of f.aggregates) {
        cols.push({ key: `${f.key}_${agg}`, label: `${f.label} ${({ avg: 'Mittel', min: 'Min', max: 'Max', sum: 'Summe' })[agg]}`, unit: f.unit });
      }
    }
  }
  return cols;
}

