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
  // Standort laut weewx.conf
  station: { latitude: 47.499074, longitude: 9.740264, altitude: 434 },
};
