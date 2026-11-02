// Regelmäßige Abrufe externer Quellen: Bodensee (VoWIS) und Sturmwarnung (Kantonspolizei TG)
import { app, setStatus } from './db.js';
import { localDate, localToUnix } from './time.js';

const SEE_URL = 'https://vowis.vorarlberg.at/api/see';
const STURM_URL = 'http://www.kttg.ch/kapo/htm/stwarn.shtml';

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const insSeeData = app.prepare('INSERT OR REPLACE INTO see_data VALUES (?, ?, ?, ?)');
const insSeeDay = app.prepare('INSERT OR REPLACE INTO see_days VALUES (?, ?, ?, ?)');
const insSeeHist = app.prepare('INSERT OR REPLACE INTO see_hist VALUES (?, ?, ?, ?)');

export async function updateLake() {
  const [see] = JSON.parse(await fetchText(SEE_URL));
  // Hochwasser-Kennwerte (Pegel in cm) für die Linien im Diagramm
  const flood = Object.fromEntries(['hW2', 'hW10', 'hW20', 'hW30', 'hW50', 'hW100']
    .filter((k) => see[k] != null).map((k) => [`HW${k.slice(2)}`, see[k]]));
  setStatus('see', { flood, nnw: see.nnw, hhw: see.hhw });

  const t = Math.floor(Date.parse(see.wasserstand.datum) / 1000);
  insSeeData.run(t, see.wtMilli05?.wert ?? null, see.wtMilli25?.wert ?? null, see.wasserstand.wert);
  for (const d of see.seeArchiv ?? []) {
    const date = d.datum.slice(0, 10);
    insSeeDay.run(date, d.wtMilli05 ?? null, d.wtMilli25 ?? null, d.w ?? null);
    insSeeHist.run(date.slice(5), d.Min ?? null, d.Mit ?? null, d.Max ?? null);
  }
}

const LEVELS = { 'keine Warnung': 0, Starkwindwarnung: 40, Sturmwarnung: 90 };
const REGIONS = ['west', 'mitte', 'ost'];
const insSturm = app.prepare('INSERT OR REPLACE INTO sturm_data VALUES (?, ?)');
const qSturmDay = app.prepare(`SELECT
  SUM(warnstufe = 40) AS starkwind, SUM(warnstufe = 90) AS sturm
  FROM sturm_data WHERE dateTime >= ? AND dateTime < ?`);
const insSturmDay = app.prepare('INSERT OR REPLACE INTO sturm_days VALUES (?, ?, ?)');

export async function updateStorm() {
  const html = await fetchText(STURM_URL);
  const found = [...html.matchAll(/<strong>\s*([^<]+?)\s*<\/strong>/gi)]
    .map((m) => m[1].replace(/\s+/g, ' '))
    .filter((s) => s in LEVELS);
  if (found.length < 3) throw new Error('Sturmwarnung: Seite nicht erkannt');

  const state = Object.fromEntries(REGIONS.map((r, i) => [r, LEVELS[found[i]]]));
  setStatus('sturm', state);

  // Wie bisher: Region Ost (Bregenz), in 5-Minuten-Schritten zählen
  if (state.ost > 0) {
    const now = Math.floor(Date.now() / 1000);
    insSturm.run(now - (now % 300), state.ost);
  }
  const date = localDate(Math.floor(Date.now() / 1000));
  const start = localToUnix(date);
  const r = qSturmDay.get(start, start + 86400);
  insSturmDay.run(date, (r.starkwind ?? 0) * 5, (r.sturm ?? 0) * 5);
}

function every(minutes, name, fn) {
  const run = () => fn().catch((e) => log(`${name}:`, e.message));
  run();
  setInterval(run, minutes * 60 * 1000);
}

export function startJobs() {
  every(15, 'Bodensee', updateLake);
  every(5, 'Sturmwarnung', updateStorm);
}
