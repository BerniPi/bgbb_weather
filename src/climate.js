// Klima: Rekorde, Monats- und Jahrestabellen, Monatsbericht
import { maxOf, minOf, prepared, convert, statsDays } from './summaries.js';
import { aggregateRows } from './aggregate.js';
import { FIELD_MAP } from './fields.js';
import { archiveSpan } from './weather.js';
import { dayExclusion } from './corrections.js';
import { dayValues, countTypes, dayTypeInfo } from './daytypes.js';
import { localDate, localToUnix, addDays, period } from './time.js';

const ALL = [0, 4102444800]; // ganzer Datenbestand (bis 2100)
const CACHE_MS = 10 * 60 * 1000;

// --- Rekorde ----------------------------------------------------------------------

/** Tag mit dem größten/kleinsten Wert einer Tagesspalte (z. B. niedrigstes Tagesmaximum) */
function dailyExtreme(obs, expr, order) {
  const r = prepared(`SELECT dateTime, ${expr} AS v FROM archive_day_${obs}
    WHERE count > 0 AND ${expr} IS NOT NULL${dayExclusion(obs)} ORDER BY v ${order} LIMIT 1`).get();
  return r ? { value: convert(obs, r.v), date: localDate(r.dateTime) } : null;
}

function records(daily) {
  const at = (e) => (e ? { value: e.value, time: e.time } : null);
  const sunniest = daily.reduce((b, d) => (d.sunshine > (b?.sunshine ?? -1) ? d : b), null);
  return [
    { title: 'Temperatur', unit: '°C', items: [
      ['Höchste', at(maxOf('outTemp', ...ALL))],
      ['Tiefste', at(minOf('outTemp', ...ALL))],
      ['Wärmster Tag (Mittel)', dailyExtreme('outTemp', 'wsum / sumtime', 'DESC')],
      ['Kältester Tag (Mittel)', dailyExtreme('outTemp', 'wsum / sumtime', 'ASC')],
      ['Niedrigstes Tagesmaximum', dailyExtreme('outTemp', 'max', 'ASC')],
      ['Höchstes Tagesminimum', dailyExtreme('outTemp', 'min', 'DESC')],
    ] },
    { title: 'Gefühlt und Taupunkt', unit: '°C', items: [
      ['Höchster Hitzeindex', at(maxOf('heatindex', ...ALL))],
      ['Tiefster Windchill', at(minOf('windchill', ...ALL))],
      ['Höchster Taupunkt', at(maxOf('dewpoint', ...ALL))],
      ['Tiefster Taupunkt', at(minOf('dewpoint', ...ALL))],
    ] },
    { title: 'Niederschlag', unit: 'mm', items: [
      ['Nassester Tag', dailyExtreme('rain', 'sum', 'DESC')],
      ['Höchste Rate', at(maxOf('rainRate', ...ALL)), 'mm/h'],
    ] },
    { title: 'Wind', unit: 'km/h', items: [
      ['Stärkste Böe', at(maxOf('wind', ...ALL))],
      ['Höchstes 5-Minuten-Mittel', at(maxOf('windSpeed', ...ALL))],
      ['Windigster Tag (Mittel)', dailyExtreme('windSpeed', 'wsum / sumtime', 'DESC')],
    ] },
    { title: 'Luftdruck', unit: 'hPa', items: [
      ['Höchster', at(maxOf('barometer', ...ALL))],
      ['Tiefster', at(minOf('barometer', ...ALL))],
    ] },
    { title: 'Sonne', unit: '', items: [
      ['Höchste Strahlung', at(maxOf('radiation', ...ALL)), 'W/m²'],
      ['Höchster UV-Index', at(maxOf('UV', ...ALL)), ''],
      ['Sonnigster Tag', sunniest ? { value: sunniest.sunshine, date: sunniest.date } : null, 'h'],
    ] },
  ].map((g) => ({
    title: g.title,
    items: g.items.map(([label, rec, unit]) => ({ label, unit: unit ?? g.unit, ...rec })),
  }));
}

// --- Monats- und Jahrestabellen --------------------------------------------------

const MONTH_FIELDS = ['outTemp', 'rain'].map((k) => FIELD_MAP.get(k));

function summarize(monthRow, days) {
  const out = {
    tavg: monthRow?.outTemp_avg ?? null,
    tmax: monthRow?.outTemp_max ?? null,
    tmin: monthRow?.outTemp_min ?? null,
    rain: monthRow?.rain_sum ?? null,
    sunshine: days.length ? Math.round(days.reduce((s, d) => s + (d.sunshine ?? 0), 0) * 10) / 10 : null,
    days: days.length,
  };
  // Kenntage (daytypes.js) als counts: { ice, frost, … }
  out.counts = countTypes(days);
  return out;
}

function tables(daily, span) {
  const end = localToUnix(addDays(localDate(span.last), 1));
  const months = new Map(aggregateRows('month', span.first, span.last, end, MONTH_FIELDS).map((r) => [r.time, r]));
  const years = new Map(aggregateRows('year', span.first, span.last, end, MONTH_FIELDS).map((r) => [r.time, r]));

  const byYear = new Map();
  for (const d of daily) {
    const y = d.date.slice(0, 4);
    const m = Number(d.date.slice(5, 7));
    if (!byYear.has(y)) byYear.set(y, new Map());
    const ym = byYear.get(y);
    if (!ym.has(m)) ym.set(m, []);
    ym.get(m).push(d);
  }

  return [...byYear].map(([year, ym]) => ({
    year: Number(year),
    months: Array.from({ length: 12 }, (_, i) => {
      const days = ym.get(i + 1) ?? [];
      return days.length ? summarize(months.get(`${year}-${String(i + 1).padStart(2, '0')}`), days) : null;
    }),
    total: summarize(years.get(year), [...ym.values()].flat()),
  }));
}

let cache = null;

/** Rekorde und Tabellen; Tageswerte aus dem Cache von daytypes.js, das Ergebnis 10 min zwischengespeichert */
export function climate() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const span = archiveSpan();
  const firstDay = localToUnix(localDate(span.first));
  const lastDay = localToUnix(localDate(span.last));
  const daily = dayValues(localDate(span.first), localDate(span.last));
  const data = {
    span: { first: localDate(span.first), last: localDate(span.last) },
    dayTypes: dayTypeInfo(),
    records: records(daily),
    years: tables(daily, { first: firstDay, last: lastDay }),
  };
  cache = { at: Date.now(), data };
  return data;
}

// --- Monatsbericht ----------------------------------------------------------------

/** Tageswerte eines Monats ('JJJJ-MM') mit Extremwerten und Zeitpunkten, plus Monatsstatistik */
export function monthReport(ym) {
  const p = period('month', `${ym}-01`);
  const latest = archiveSpan().last ?? 0;
  const days = [];
  for (let iso = p.first; iso <= p.last; iso = addDays(iso, 1)) {
    const start = localToUnix(iso);
    if (start > latest) break;
    const stats = statsDays(start, start, Math.min(localToUnix(addDays(iso, 1)), latest));
    if (stats) days.push({ date: iso, ...stats });
  }
  return {
    month: ym,
    prev: p.prev.slice(0, 7),
    next: p.next.slice(0, 7),
    days,
    total: days.length ? statsDays(p.firstDay, p.lastDay, Math.min(p.end, latest)) : null,
  };
}
