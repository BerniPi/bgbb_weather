// Livewerte per Server-Sent Events. Ohne Livequelle (404) oder bei Abbruch bleibt die Seite
// einfach bei den minütlichen Werten.
import { API } from './api.js';

// Ohne Paket so lange gilt die Anzeige nicht mehr als live
const LIVE_TIMEOUT = 30 * 1000;

// Werte, die das Loop-Paket in der Anzeige ersetzt. Böe und Tageswerte bleiben aus dem Archiv
// (10-Minuten- bzw. Tagesmaximum).
const LIVE_FIELDS = ['outTemp', 'outHumidity', 'dewpoint', 'windchill', 'heatindex', 'barometer', 'pressure',
  'windSpeed', 'windDir', 'rainRate', 'radiation', 'UV'];

/** Livewerte in die zuletzt geladenen aktuellen Werte einsetzen */
export function mergeLive(weather, packet) {
  if (!weather || !packet) return weather;
  const merged = { ...weather, time: Math.max(weather.time, packet.time), live: true };
  for (const f of LIVE_FIELDS) if (packet[f] != null) merged[f] = packet[f];
  return merged;
}

/**
 * Livewerte abonnieren. onPacket(packet) bei jedem Paket, onLive(true|false) beim Wechsel.
 * Gibt eine Funktion zum Beenden zurück.
 */
export function subscribeLive(onPacket, onLive = () => {}) {
  if (!('EventSource' in window)) return () => {};
  let live = false;
  let timer = null;
  const setLive = (v) => { if (v !== live) { live = v; onLive(v); } };

  const source = new EventSource(API.live);
  source.onmessage = (e) => {
    setLive(true);
    clearTimeout(timer);
    timer = setTimeout(() => setLive(false), LIVE_TIMEOUT);
    onPacket(JSON.parse(e.data));
  };
  // 404 (keine Livequelle) beendet die Verbindung, sonst verbindet der Browser selbst neu
  source.onerror = () => { if (source.readyState === EventSource.CLOSED) setLive(false); };
  return () => { clearTimeout(timer); source.close(); };
}
