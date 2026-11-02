// Bekannte Messfehler. Das Archiv bleibt unverändert; die App blendet die Werte beim Lesen aus:
//  - in 5-Minuten-Datensätzen wird das Feld zu null (cleanRow)
//  - in den Tageszusammenfassungen zählen Min/Max dieses Tages nicht (dayExclusion)
import { toDisplay } from './units.js';
import { localToUnix, startOfLocalDay } from './time.js';

const CORRECTIONS = [
  { time: '2022-05-16 07:55', fields: ['windGust'], reason: 'Böe 174 km/h bei 2 km/h Mittelwind – Funkstörung' },
];

// weewx-Tageszusammenfassungen, in die ein Feld eingeht
const DAY_TABLES = { windGust: ['windGust', 'wind'], windSpeed: ['windSpeed', 'wind'] };

const byRecord = new Map(); // dateTime → Felder
const byTable = new Map(); // Tabelle → Tagesbeginne
for (const c of CORRECTIONS) {
  const t = localToUnix(c.time);
  byRecord.set(t, [...(byRecord.get(t) ?? []), ...c.fields]);
  for (const f of c.fields) {
    for (const table of DAY_TABLES[f] ?? [f]) {
      byTable.set(table, [...(byTable.get(table) ?? []), startOfLocalDay(t)]);
    }
  }
}

/** Datensatz in Anzeigeeinheiten, bekannte Fehlwerte = null */
export function cleanRow(raw) {
  const row = toDisplay(raw);
  for (const f of byRecord.get(row.dateTime) ?? []) row[f] = null;
  return row;
}

/** Tagesbeginne, an denen Min/Max von archive_day_<table> nicht zählen */
export function excludedDays(table) {
  return byTable.get(table) ?? [];
}

/** Dasselbe als SQL-Bedingung für Abfragen auf archive_day_<table> */
export function dayExclusion(table) {
  const days = excludedDays(table);
  return days.length ? ` AND dateTime NOT IN (${days.join(',')})` : '';
}

/** Liste für die Stationsseite */
export function correctionList() {
  return CORRECTIONS.map(({ time, fields, reason }) => ({ time, fields, reason }));
}
