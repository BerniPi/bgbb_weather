// Kenntage nach dem Glossar des Deutschen Wetterdienstes: Tage, an denen ein Schwellenwert erreicht wird.
// Tageswerte aus archive_day_* (wie überall), Nacht-Minimum und 10-min-Wind aus den 5-Minuten-Datensätzen.
import { prepared, convert } from './summaries.js';
import { aggregateRows } from './aggregate.js';
import { recordExclusion } from './corrections.js';
import { FIELD_MAP } from './fields.js';
import { archiveSpan } from './weather.js';
import { localToUnix, addDays } from './time.js';

const STORM_KMH = 17.2 * 3.6; // 8 Beaufort

/**
 * Reihenfolge = Anzeige. test bekommt die Tageswerte aus dayValues().
 * Eistag und Tropennacht stehen erst fest, wenn der Tag bzw. die Nacht vorbei ist.
 */
export const DAY_TYPES = [
  { key: 'ice', label: 'Eistag', plural: 'Eistage', hint: 'Höchstwert unter 0 °C', group: 'cold',
    test: (d) => d.complete && d.tmax < 0 },
  { key: 'frost', label: 'Frosttag', plural: 'Frosttage', hint: 'Tiefstwert unter 0 °C', group: 'cold',
    test: (d) => d.tmin < 0 },
  { key: 'summer', label: 'Sommertag', plural: 'Sommertage', hint: 'Höchstwert mindestens 25 °C', group: 'warm',
    test: (d) => d.tmax >= 25 },
  { key: 'hot', label: 'Heißer Tag', plural: 'Heiße Tage', hint: 'Höchstwert mindestens 30 °C', group: 'hot',
    test: (d) => d.tmax >= 30 },
  { key: 'tropicalNight', label: 'Tropennacht', plural: 'Tropennächte', group: 'hot',
    hint: 'Tiefstwert der Nacht (18–06 Uhr UTC) mindestens 20 °C; zählt für den Tag, an dem die Nacht endet',
    test: (d) => d.nightComplete && d.nightMin >= 20 },
  { key: 'rain', label: 'Regentag', plural: 'Regentage', hint: 'mindestens 1 mm Niederschlag', group: 'rain',
    test: (d) => d.rain >= 1 },
  { key: 'storm', label: 'Sturmtag', plural: 'Sturmtage', hint: '10-Minuten-Mittel des Windes mindestens 8 Beaufort (62 km/h)', group: 'wind',
    test: (d) => d.wind10Max >= STORM_KMH },
];

/** Beschreibung ohne Testfunktion – für die Seiten */
export const dayTypeInfo = () => DAY_TYPES.map(({ test, ...t }) => t);

const DAY_FIELDS = ['outTemp', 'rain', 'windSpeed', 'windGust', 'sunshine'].map((k) => FIELD_MAP.get(k));
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** Nacht-Minimum je UTC-Tagesnummer des Morgens (Nacht 18–06 UTC; Zeitstempel = Intervallende) */
function nightMins(from, to) {
  const st = prepared(`SELECT (dateTime - 1 + 21600) / 86400 AS night, MIN(outTemp) AS v FROM archive
    WHERE dateTime > ? AND dateTime <= ? AND (dateTime - 1 + 21600) % 86400 < 43200
      AND outTemp IS NOT NULL${recordExclusion('outTemp')} GROUP BY night`);
  return new Map(st.all(from, to).map((r) => [r.night, convert('outTemp', r.v)]));
}

/** Höchstes 10-Minuten-Mittel (zwei aufeinanderfolgende 5-min-Mittel) je Ortstag; dayStarts aufsteigend, lückenlos */
function wind10Max(dayStarts, end) {
  const st = prepared(`SELECT h, MAX(v) AS v FROM (
      SELECT (dateTime - 1) / 3600 AS h, (windSpeed + LAG(windSpeed) OVER w) / 2 AS v,
        dateTime - LAG(dateTime) OVER w AS gap
      FROM archive WHERE dateTime > ? AND dateTime <= ?${recordExclusion('windSpeed')} WINDOW w AS (ORDER BY dateTime))
    WHERE gap = 300 AND v IS NOT NULL GROUP BY h ORDER BY h`);
  // Stunden (UTC) fallen in Wien immer ganz in einen Ortstag
  const out = new Array(dayStarts.length).fill(null);
  let i = 0;
  for (const r of st.iterate(dayStarts[0] - 300, end)) {
    const t = r.h * 3600;
    while (i + 1 < dayStarts.length && t >= dayStarts[i + 1]) i++;
    if (t < dayStarts[0]) continue;
    out[i] = Math.max(out[i] ?? 0, convert('windSpeed', r.v));
  }
  return out;
}

function compute(first, last, latest) {
  const firstDay = localToUnix(first);
  const end = Math.min(localToUnix(addDays(last, 1)), latest);
  const rows = aggregateRows('day', firstDay, localToUnix(last), end, DAY_FIELDS);
  if (!rows.length) return [];
  const dates = [];
  for (let iso = rows[0].time; iso <= rows.at(-1).time; iso = addDays(iso, 1)) dates.push(iso);
  const index = new Map(dates.map((iso, i) => [iso, i]));
  const wind10 = wind10Max(dates.map((iso) => localToUnix(iso)), end);
  const nights = nightMins(localToUnix(dates[0]) - 86400, end);

  return rows.map((r) => {
    const nightEnd = Date.parse(`${r.time}T06:00:00Z`) / 1000;
    const d = {
      date: r.time,
      tavg: r.outTemp_avg,
      tmax: r.outTemp_max,
      tmin: r.outTemp_min,
      nightMin: round1(nights.get(Math.floor(nightEnd / 86400))),
      rain: r.rain_sum,
      sunshine: r.sunshine_sum == null ? null : round1(r.sunshine_sum / 60),
      windAvg: r.windSpeed_avg,
      wind10Max: round1(wind10[index.get(r.time)]),
      gustMax: r.windGust_max,
      complete: localToUnix(addDays(r.time, 1)) <= latest,
      nightComplete: nightEnd <= latest,
    };
    d.types = DAY_TYPES.filter((t) => t.test(d)).map((t) => t.key);
    return d;
  });
}

// Abgeschlossene Tage ändern sich nicht mehr: Datum → Tageswerte (null = keine Messdaten)
const cache = new Map();

/**
 * Wichtigste Tageswerte mit Kenntagen für die Tage [first, last] ('JJJJ-MM-TT').
 * Nur Tage mit Messdaten; types = Schlüssel aus DAY_TYPES.
 */
export function dayValues(first, last) {
  const latest = archiveSpan().last ?? 0;
  if (localToUnix(first) > latest) return [];
  let missing = first;
  while (missing <= last && cache.has(missing)) missing = addDays(missing, 1);

  if (missing <= last) {
    const fresh = new Map(compute(missing, last, latest).map((d) => [d.date, d]));
    for (let iso = missing; iso <= last; iso = addDays(iso, 1)) {
      const d = fresh.get(iso) ?? null;
      const done = d ? d.complete && d.nightComplete : localToUnix(addDays(iso, 1)) <= latest;
      if (done) cache.set(iso, d);
      else if (d) cache.delete(iso);
      if (d && !done) fresh.set(iso, d);
    }
    const out = [];
    for (let iso = first; iso <= last; iso = addDays(iso, 1)) {
      const d = cache.get(iso) ?? fresh.get(iso);
      if (d) out.push(d);
    }
    return out;
  }
  const out = [];
  for (let iso = first; iso <= last; iso = addDays(iso, 1)) {
    const d = cache.get(iso);
    if (d) out.push(d);
  }
  return out;
}

/** Anzahl je Kenntag (alle Schlüssel, auch 0) */
export function countTypes(days) {
  const counts = Object.fromEntries(DAY_TYPES.map((t) => [t.key, 0]));
  for (const d of days) for (const k of d.types) counts[k]++;
  return counts;
}

/** Kenntage eines Zeitraums für die Anzeige: nur die vorkommenden, mit Anzahl */
export function dayTypeSummary(days) {
  const counts = countTypes(days);
  return dayTypeInfo().filter((t) => counts[t.key]).map((t) => ({ ...t, count: counts[t.key] }));
}
