import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

const envFile = resolve(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8080),
  weewxDb: resolve(ROOT, env.WEEWX_DB ?? 'data/weewx.sdb'),
  appDb: resolve(ROOT, env.APP_DB ?? 'data/app.db'),
  jobs: env.JOBS !== '0',
  // Livewerte: Loop-Pakete von weewx-mqtt, oder Simulator für die Entwicklung
  live: {
    mqttUrl: env.MQTT_URL || null,
    topic: env.MQTT_TOPIC || 'weather/loop',
    simulate: env.LIVE_SIM === '1',
  },
  // Standort laut weewx.conf
  station: { latitude: 47.499074, longitude: 9.740264, altitude: 434 },
};
