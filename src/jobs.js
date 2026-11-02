// Regelmäßige Abrufe externer Quellen: Bodensee (VoWIS) und Sturmwarnung (Kantonspolizei TG)
import { saveLake } from './lake.js';
import { parseStormPage, saveStorm } from './storm.js';

const SEE_URL = 'https://vowis.vorarlberg.at/api/see';
const STURM_URL = 'http://www.kttg.ch/kapo/htm/stwarn.shtml';

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export async function updateLake() {
  const [see] = JSON.parse(await fetchText(SEE_URL));
  saveLake(see);
}

export async function updateStorm() {
  saveStorm(parseStormPage(await fetchText(STURM_URL)));
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
