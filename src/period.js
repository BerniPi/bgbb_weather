// Daten für die Verlaufsseite: ein Kalenderzeitraum (Tag, Woche, Monat, Jahr)
import { statsDays } from './summaries.js';
import { aggregateRows } from './aggregate.js';
import { FIELD_MAP } from './fields.js';
import { seriesRange, archiveSpan } from './weather.js';
import { lakeChart, lakeDays, lakeStats } from './lake.js';
import { period, localDate, addDays } from './time.js';

// Tageswerte für Monats- und Jahresdiagramme
const DAILY_FIELDS = ['outTemp', 'rain', 'windSpeed', 'windGust', 'barometer', 'outHumidity', 'radiation', 'sunshine']
  .map((k) => FIELD_MAP.get(k));

/** range = day|week|month|year, iso = ein Datum im Zeitraum */
export function periodData(range, iso) {
  const p = period(range, iso);
  const span = archiveSpan();
  const latest = span.last ?? 0;
  const until = Math.min(p.end, latest);
  const base = {
    period: p,
    firstData: span.first ? localDate(span.first) : null,
    lastData: localDate(latest),
  };
  if (p.firstDay > latest) return { ...base, stats: null };

  const intraday = range === 'day' || range === 'week';
  return {
    ...base,
    stats: statsDays(p.firstDay, p.lastDay, until),
    series: intraday ? seriesRange(p.firstDay, until) : null,
    daily: intraday ? null : aggregateRows('day', p.firstDay, p.lastDay, until, DAILY_FIELDS),
    lake: {
      stats: lakeStats(lakeDays(p.first, p.last)),
      ...lakeChart(intraday ? addDays(p.last, -27) : p.first, p.last),
    },
  };
}
