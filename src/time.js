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

/** Unix-Sekunden → ISO 8601 in Ortszeit mit Versatz, z. B. '2024-07-01T13:05+02:00' */
export function isoLocal(unix) {
  const p = localParts(unix);
  const off = offsetAt(unix) / 60;
  const pad = (n) => String(n).padStart(2, '0');
  const sign = off >= 0 ? '+' : '-';
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
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

// Kalenderrechnung auf 'YYYY-MM-DD' (über UTC, damit Sommerzeit keine Rolle spielt)
const isoOf = (d) => d.toISOString().slice(0, 10);
const utcOf = (iso) => new Date(`${iso}T00:00:00Z`);

/** 'YYYY-MM-DD' plus n Tage */
export function addDays(iso, n) {
  const d = utcOf(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/**
 * Kalenderzeitraum, der das Datum enthält.
 * range: 'day' | 'week' (Mo–So) | 'month' | 'year'
 * Ergebnis: erster und letzter Tag (ISO) sowie deren Tagesbeginn als Unix-Zeit
 * und das Ende (exklusiv) – plus Datum im vorigen und nächsten Zeitraum.
 */
export function period(range, iso) {
  const d = utcOf(iso);
  let first;
  let last;
  if (range === 'week') {
    first = addDays(iso, -((d.getUTCDay() + 6) % 7));
    last = addDays(first, 6);
  } else if (range === 'month') {
    first = `${iso.slice(0, 7)}-01`;
    last = isoOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  } else if (range === 'year') {
    first = `${iso.slice(0, 4)}-01-01`;
    last = `${iso.slice(0, 4)}-12-31`;
  } else {
    first = iso;
    last = iso;
  }
  return {
    range,
    first,
    last,
    firstDay: localToUnix(first),
    lastDay: localToUnix(last),
    end: localToUnix(addDays(last, 1)),
    prev: addDays(first, -1),
    next: addDays(last, 1),
  };
}
