// Livewerte: Loop-Pakete (alle ~2,5 s) von weewx-mqtt oder vom Simulator,
// umgerechnet in Anzeigeeinheiten und per Server-Sent Events an die Browser verteilt.
import { config } from './config.js';
import { toDisplay } from './units.js';
import { current } from './weather.js';

// Felder, die an die Browser gehen
const FIELDS = ['outTemp', 'outHumidity', 'dewpoint', 'windchill', 'heatindex', 'barometer', 'pressure',
  'windSpeed', 'windDir', 'windGust', 'rainRate', 'radiation', 'UV'];

// weewx-mqtt mit append_units_label = true hängt Einheiten an (outTemp_C) – abschneiden
const UNIT_SUFFIX = /_(C|F|mbar|hPa|inHg|km_per_hour|mile_per_hour|meter_per_second|knot|mm|cm|inch|mm_per_hour|cm_per_hour|inch_per_hour|percent|degree_compass|watt_per_meter_squared|uv_index)$/;
// Ohne usUnits im Paket: weewx-mqtt-Einstellung unit_system = METRIC (16)
const DEFAULT_US_UNITS = 16;

let latest = null;
const clients = new Set();

/** Rohes MQTT-Paket → { time, <feld>: wert } in Anzeigeeinheiten */
export function normalize(payload) {
  const raw = {};
  for (const [k, v] of Object.entries(payload)) {
    const n = typeof v === 'number' ? v : Number.parseFloat(v);
    if (!Number.isNaN(n)) raw[k.replace(UNIT_SUFFIX, '')] = n;
  }
  if (!raw.dateTime) return null;
  const row = toDisplay({ usUnits: raw.usUnits ?? DEFAULT_US_UNITS, ...raw });
  const packet = { time: Math.round(row.dateTime) };
  for (const f of FIELDS) if (row[f] != null) packet[f] = row[f];
  return packet;
}

const round2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

function publish(packet) {
  // Loop-Pakete enthalten nicht immer alle Größen – fehlende vom letzten Paket übernehmen
  latest = { ...latest, ...Object.fromEntries(Object.entries(packet).map(([k, v]) => [k, round2(v)])) };
  const msg = `data: ${JSON.stringify(latest)}\n\n`;
  for (const res of clients) res.write(msg);
}

/** Express-Handler für /api/v1/live (text/event-stream) */
export function liveStream(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  if (latest) res.write(`data: ${JSON.stringify(latest)}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export const liveEnabled = () => Boolean(config.live.mqttUrl || config.live.simulate);

const log = (...a) => console.log(new Date().toISOString(), 'Live:', ...a);

async function startMqtt({ mqttUrl, topic }) {
  const { default: mqtt } = await import('mqtt');
  const client = mqtt.connect(mqttUrl, { reconnectPeriod: 5000 });
  client.on('connect', () => { log(`verbunden mit ${mqttUrl}, Thema ${topic}`); client.subscribe(topic); });
  client.on('error', (e) => log(e.message));
  client.on('message', (t, message) => {
    try {
      const packet = normalize(JSON.parse(message.toString()));
      if (packet) publish(packet);
    } catch (e) {
      log('Paket nicht lesbar:', e.message);
    }
  });
}

// Simulator: letzte Archivwerte mit kleinem Rauschen, Wind böig – nur für die Entwicklung
function startSimulator() {
  log('Simulator aktiv (LIVE_SIM=1)');
  const jitter = (v, amount) => (v == null ? null : v + (Math.random() - 0.5) * amount);
  setInterval(() => {
    const w = current();
    if (!w) return;
    const wind = Math.max(0, jitter(w.windSpeed ?? 3, 6));
    publish({
      time: Math.floor(Date.now() / 1000),
      outTemp: jitter(w.outTemp, 0.2),
      outHumidity: Math.min(100, jitter(w.outHumidity, 1)),
      dewpoint: jitter(w.dewpoint, 0.2),
      windchill: jitter(w.windchill, 0.2),
      heatindex: jitter(w.heatindex, 0.2),
      barometer: jitter(w.barometer, 0.1),
      pressure: jitter(w.pressure, 0.1),
      windSpeed: wind,
      windGust: wind * 1.3,
      windDir: ((w.windDir ?? 200) + (Math.random() - 0.5) * 60 + 360) % 360,
      rainRate: w.rainRate,
      radiation: w.radiation,
      UV: w.UV,
    });
  }, 2500);
}

export function startLive() {
  if (config.live.mqttUrl) startMqtt(config.live).catch((e) => log(e.message));
  else if (config.live.simulate) startSimulator();
}
