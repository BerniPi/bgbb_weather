// Zeitzonen-Hilfen für Europe/Vienna (ohne externe Bibliothek)

export const TZ = 'Europe/Vienna';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Ortszeit-Bestandteile eines Unix-Zeitstempels (Sekunden) */
export function localParts(unix) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(unix * 1000)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Versatz Ortszeit − UTC in Sekunden zum Zeitpunkt unix */
function offsetAt(unix) {
  const p = localParts(unix);
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) / 1000) - unix;
}

/** 'YYYY-MM-DD HH:MM[:SS]' in Wiener Ortszeit → Unix-Sekunden */
export function localToUnix(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) / 1000;
  let ts = asUtc - offsetAt(asUtc);
  ts = asUtc - offsetAt(ts); // zweiter Durchlauf für Zeiten nahe der Umstellung
  return ts;
}

/** Unix-Sekunden → 'YYYY-MM-DD' (Ortszeit) */
export function localDate(unix) {
  const p = localParts(unix);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Unix-Sekunden → 'HH:MM' (Ortszeit) */
export function localTime(unix) {
  const p = localParts(unix);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

/** Beginn des Ortstages (Mitternacht) für einen Zeitpunkt */
export function startOfLocalDay(unix) {
  return localToUnix(localDate(unix));
}
