// Inhalte, die Startseite und Schaufenster gleich zeigen: Aktualität, Sonne/Mond, Sturmwarnung
import { hm, day } from './format.js';

/** Ab so vielen Sekunden ohne neue Messung gilt die Anzeige als veraltet */
export const STALE_AFTER = 15 * 60;
export const isStale = (time) => Date.now() / 1000 - time > STALE_AFTER;

const duration = (s) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;

/**
 * Zeilen [Bezeichnung, Wert] für Sonne und Mond.
 * compact: kürzere Liste fürs Schaufenster
 */
export function almanacItems({ sun, moon }, { compact = false } = {}) {
  const seasons = [['Tagundnachtgleiche', sun.equinox], ['Sonnenwende', sun.solstice]]
    .sort((a, b) => a[1] - b[1])
    .map(([k, t]) => (compact ? [k, day(t)] : [`nächste ${k}`, `${day(t)} ${hm(t)}`]));
  const sunItems = [
    ['Aufgang', hm(sun.rise)],
    ['Höchststand', hm(sun.transit)],
    ['Untergang', hm(sun.set)],
    !compact && sun.rise && sun.set ? ['Tageslänge', duration(sun.set - sun.rise)] : null,
    ...seasons,
  ];

  const moonTimes = [['Aufgang', moon.rise], ['Höchststand', compact ? null : moon.transit], ['Untergang', moon.set]]
    .filter(([, t]) => t != null).sort((a, b) => a[1] - b[1]).map(([k, t]) => [k, hm(t)]);
  const phases = [['Vollmond', moon.nextFull], ['Neumond', moon.nextNew]]
    .sort((a, b) => a[1] - b[1]).map(([k, t]) => [compact ? k : `nächster ${k}`, day(t)]);
  const moonItems = compact
    ? [...moonTimes, ...phases, ['Phase', moon.phase], ['beleuchtet', `${moon.illumination} %`]]
    : [...moonTimes, ['Phase', `${moon.phase} (${moon.illumination} %)`], ...phases];

  return { sun: sunItems.filter(Boolean), moon: moonItems };
}

/** Sturmwarnung Region Ost: null ohne Warnung, sonst { level, short, text } */
export function stormWarning(storm) {
  const level = storm?.ost ?? 0;
  if (!level) return null;
  return level >= 90
    ? { level, short: 'STURMWARNUNG Bodensee', text: 'Sturmwarnung Bodensee Ost – Sturmböen über 60 km/h erwartet' }
    : { level, short: 'Starkwindwarnung Bodensee', text: 'Starkwindwarnung Bodensee Ost – Windböen über 45 km/h erwartet' };
}
