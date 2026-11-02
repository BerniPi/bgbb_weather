// Kenntage nach dem Glossar des Deutschen Wetterdienstes: Tage, an denen ein Schwellenwert erreicht wird.
// Tageswerte aus archive_day_* (wie überall), Nacht-Minimum und 10-min-Wind aus den 5-Minuten-Datensätzen.
import { prepared } from './summaries.js';
import { aggregateRows } from './aggregate.js';
import { cleanRow } from './corrections.js';
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

/**
 * Nacht-Minimum (18–06 UTC, gehört zum Datum des Morgens) und höchstes 10-Minuten-Mittel des Windes
 * je Ortstag. dayStarts: Tagesbeginne aufeinanderfolgender Tage, aufsteigend.
 */
function archiveExtras(dayStarts, end) {
  const nightMin = new Map();
  const wind10 = new Array(dayStarts.length).fill(null);
  const st = prepared(`SELECT dateTime, usUnits, interval, outTemp, windSpeed FROM archive
    WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime`);
  let i = 0;
  let prev = null;
  // Nacht beginnt am Vorabend um 18 UTC
  for (const raw of st.iterate(dayStarts[0] - 12 * 3600, end)) {
    const r = cleanRow(raw);
    const s = r.dateTime - 1 + 6 * 3600; // Intervallende → Nacht 18–06 UTC wird zu 00–12 UTC
    if (r.outTemp != null && (s % 86400) < 12 * 3600) {
      const night = Math.floor(s / 86400); // UTC-Tagesnummer des Morgens
      const m = nightMin.get(night);
      if (m == null || r.outTemp < m) nightMin.set(night, r.outTemp);
    }
    if (r.dateTime > dayStarts[0]) {
      while (i + 1 < dayStarts.length && r.dateTime > dayStarts[i + 1]) i++;
      // zwei aufeinanderfolgende 5-Minuten-Mittel = 10-Minuten-Mittel
      if (prev && r.dateTime - prev.dateTime === 300 && r.windSpeed != null && prev.windSpeed != null) {
        const v = (r.windSpeed + prev.windSpeed) / 2;
        if (wind10[i] == null || v > wind10[i]) wind10[i] = v;
      }
    }
    prev = r;
  }
  return { nightMin, wind10 };
}

/**
 * Wichtigste Tageswerte mit Kenntagen für die Tage [first, last] ('JJJJ-MM-TT').
 * Nur Tage mit Messdaten; types = Schlüssel aus DAY_TYPES.
 */
export function dayValues(first, last) {
  const latest = archiveSpan().last ?? 0;
  const firstDay = localToUnix(first);
  const lastDay = localToUnix(last);
  const end = Math.min(localToUnix(addDays(last, 1)), latest);
  if (firstDay > latest) return [];

  const rows = aggregateRows('day', firstDay, lastDay, end, DAY_FIELDS);
  if (!rows.length) return [];
  const dates = [];
  for (let iso = rows[0].time; iso <= rows.at(-1).time; iso = addDays(iso, 1)) dates.push(iso);
  const starts = dates.map((iso) => localToUnix(iso));
  const { nightMin, wind10 } = archiveExtras(starts, end);
  const index = new Map(dates.map((iso, i) => [iso, i]));

  return rows.map((r) => {
    const nightEnd = Date.parse(`${r.time}T06:00:00Z`) / 1000;
    const night = nightMin.get(Math.floor(nightEnd / 86400));
    const d = {
      date: r.time,
      tavg: r.outTemp_avg,
      tmax: r.outTemp_max,
      tmin: r.outTemp_min,
      nightMin: round1(night),
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
