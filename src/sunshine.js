// Sonnenschein-Schätzung aus der Globalstrahlung.
// Übernommen aus sun_data()/sun_pc() der alten lib.php, damit die
// Sonnenscheindauer mit den bisherigen Werten vergleichbar bleibt.
import { sunTimes } from './astro.js';
import { localParts, startOfLocalDay } from './time.js';

function dayOfYear(p) {
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 1)) / 86400000);
}

// Tagesgrößen je UTC-Stunde zwischenspeichern: die Zeitzonenrechnung (Intl) ist
// der teure Teil, und innerhalb einer Stunde bleibt der Ortstag gleich
const dayCache = new Map();
function dayContext(t) {
  const key = Math.floor(t / 3600);
  let c = dayCache.get(key);
  if (!c) {
    if (dayCache.size > 50000) dayCache.clear();
    const day = dayOfYear(localParts(t));
    const dayStart = startOfLocalDay(t);
    const sun = sunTimes(dayStart);
    c = {
      dayStart,
      sunrise: (sun.rise - dayStart) / 3600 + 0.5,
      sunset: (sun.set - dayStart) / 3600 - 0.5,
      threshold12: 104 * Math.sin(0.0172 * day - 1.35872) + 260,
      max12: 176 * Math.sin(0.0172 * day - 1.35865) + 526,
    };
    dayCache.set(key, c);
  }
  return c;
}

/** Schwelle und Maximum der Strahlung [W/m²] zum Zeitpunkt t */
function thresholds(t) {
  const { dayStart, sunrise, sunset, threshold12, max12 } = dayContext(t);
  const hour = (t - dayStart) / 3600;
  const arc = Math.sin(((hour - sunrise) * Math.PI) / (sunset - sunrise));
  return {
    threshold: Math.max(40, 40 + (threshold12 - 40) * arc),
    max: Math.max(50, 50 + (max12 - 50) * arc),
  };
}

/** Sonnenschein in Prozent (0–100), 0 = keine Sonne */
export function sunshinePercent(t, radiation) {
  if (radiation == null) return null;
  const { threshold, max } = thresholds(t);
  return Math.round(Math.max(0, Math.min(100, ((radiation - threshold) / (max - threshold)) * 100)));
}

/** Liegt die Strahlung über der Sonnenschein-Schwelle? */
export function isSunny(t, radiation) {
  return radiation != null && radiation > thresholds(t).threshold;
}
