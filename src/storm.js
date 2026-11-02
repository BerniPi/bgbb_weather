// Sturmwarnung Bodensee (Kantonspolizei Thurgau): Auswerten, Speichern, Abfragen
import { app, getStatus, setStatus } from './db.js';
import { localDate, localToUnix, addDays } from './time.js';

const LEVELS = { 'keine Warnung': 0, Starkwindwarnung: 40, Sturmwarnung: 90 };
const REGIONS = ['west', 'mitte', 'ost'];

/** Warnstufen je Region aus der HTML-Seite lesen */
export function parseStormPage(html) {
  const found = [...html.matchAll(/<strong>\s*([^<]+?)\s*<\/strong>/gi)]
    .map((m) => m[1].replace(/\s+/g, ' '))
    .filter((s) => s in LEVELS);
  if (found.length < 3) throw new Error('Sturmwarnung: Seite nicht erkannt');
  return Object.fromEntries(REGIONS.map((r, i) => [r, LEVELS[found[i]]]));
}

const insData = app.prepare('INSERT OR REPLACE INTO sturm_data VALUES (?, ?)');
const qDay = app.prepare(`SELECT SUM(warnstufe = 40) AS starkwind, SUM(warnstufe = 90) AS sturm
  FROM sturm_data WHERE dateTime >= ? AND dateTime < ?`);
const insDay = app.prepare('INSERT OR REPLACE INTO sturm_days VALUES (?, ?, ?)');

/** Aktuellen Stand speichern; wie bisher zählt Region Ost (Bregenz) in 5-Minuten-Schritten */
export function saveStorm(state, now = Math.floor(Date.now() / 1000)) {
  setStatus('sturm', state);
  if (state.ost > 0) insData.run(now - (now % 300), state.ost);
  const date = localDate(now);
  const r = qDay.get(localToUnix(date), localToUnix(addDays(date, 1)));
  insDay.run(date, (r.starkwind ?? 0) * 5, (r.sturm ?? 0) * 5);
}

/** Letzter abgerufener Stand { west, mitte, ost, updated } */
export function storm() {
  return getStatus('sturm');
}
