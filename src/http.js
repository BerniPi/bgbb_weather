// Gemeinsame Helfer für Request-Parameter (Seiten-API und öffentliche API)
import { addDays, localDate, localToUnix } from './time.js';

/** Fehler in den Parametern → HTTP 400 mit Meldung */
export class BadRequest extends Error {}

export const today = () => localDate(Math.floor(Date.now() / 1000));

/** 'JJJJ-MM-TT' prüfen; leer → fallback */
export function parseDate(value, fallback, name = 'date') {
  if (value == null || value === '') return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequest(`${name}: Datum im Format JJJJ-MM-TT erwartet`);
  }
  return value;
}

/** from/to (inklusive) → ISO-Daten plus Tagesbeginne und Ende (exklusiv) als Unix-Zeit */
export function parseRange({ from, to }, defaultTo = today()) {
  const end = parseDate(to, defaultTo, 'to');
  const start = parseDate(from, end, 'from');
  if (start > end) throw new BadRequest('from liegt nach to');
  return {
    from: start,
    to: end,
    days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
    firstDay: localToUnix(start),
    lastDay: localToUnix(end),
    end: localToUnix(addDays(end, 1)),
  };
}

/** Ganze Zahl im Bereich [min, max], sonst fallback */
export function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

/** Express-Fehlerbehandlung für BadRequest */
export function badRequestHandler(err, req, res, next) {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  return next(err);
}
