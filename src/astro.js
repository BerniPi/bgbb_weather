// Sonne, Mond und Jahreszeiten für den Stationsstandort
import * as A from 'astronomy-engine';
import { config } from './config.js';
import { startOfLocalDay } from './time.js';

const { latitude, longitude, altitude } = config.station;
const observer = new A.Observer(latitude, longitude, altitude);

const unix = (t) => (t ? Math.round(t.date.getTime() / 1000) : null);
const at = (s) => new Date(s * 1000);

function riseSet(body, dayStart) {
  const from = at(dayStart);
  const rise = A.SearchRiseSet(body, observer, +1, from, 1);
  const set = A.SearchRiseSet(body, observer, -1, from, 1);
  const transit = A.SearchHourAngle(body, observer, 0, from);
  const inDay = (s) => (s != null && s < dayStart + 86400 ? s : null);
  return { rise: inDay(unix(rise)), transit: inDay(unix(transit.time)), set: inDay(unix(set)) };
}

const sunCache = new Map();
/** Sonnenauf-/-untergang eines Ortstages (gecacht) */
export function sunTimes(dayStart) {
  if (!sunCache.has(dayStart)) {
    if (sunCache.size > 400) sunCache.clear();
    sunCache.set(dayStart, riseSet(A.Body.Sun, dayStart));
  }
  return sunCache.get(dayStart);
}

function nextSeasons(now) {
  const year = new Date(now * 1000).getUTCFullYear();
  const events = [year, year + 1].flatMap((y) => {
    const s = A.Seasons(y);
    return [
      { type: 'equinox', time: unix(s.mar_equinox) },
      { type: 'solstice', time: unix(s.jun_solstice) },
      { type: 'equinox', time: unix(s.sep_equinox) },
      { type: 'solstice', time: unix(s.dec_solstice) },
    ];
  }).filter((e) => e.time > now);
  return {
    equinox: events.find((e) => e.type === 'equinox').time,
    solstice: events.find((e) => e.type === 'solstice').time,
  };
}

const PHASES = [
  'Neumond', 'zunehmende Sichel', 'erstes Viertel', 'zunehmender Mond',
  'Vollmond', 'abnehmender Mond', 'letztes Viertel', 'abnehmende Sichel',
];

export function almanac(now = Math.floor(Date.now() / 1000)) {
  const dayStart = startOfLocalDay(now);
  const from = at(now);
  const angle = A.MoonPhase(from);
  return {
    sun: { ...sunTimes(dayStart), ...nextSeasons(now) },
    moon: {
      ...riseSet(A.Body.Moon, dayStart),
      nextFull: unix(A.SearchMoonPhase(180, from, 40)),
      nextNew: unix(A.SearchMoonPhase(0, from, 40)),
      phase: PHASES[Math.round(angle / 45) % 8],
      illumination: Math.round(A.Illumination(A.Body.Moon, from).phase_fraction * 100),
    },
  };
}
