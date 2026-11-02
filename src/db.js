import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { APP_SCHEMA_SQL } from './schema.js';

// weewx gehört das Archiv – die App liest nur
export const weewx = new DatabaseSync(config.weewxDb, { readOnly: true });

export const app = new DatabaseSync(config.appDb);
app.exec('PRAGMA journal_mode = WAL;');
app.exec(APP_SCHEMA_SQL);

export function getStatus(key) {
  const row = app.prepare('SELECT value, updated FROM status WHERE key = ?').get(key);
  return row ? { ...JSON.parse(row.value), updated: row.updated } : null;
}

export function setStatus(key, value) {
  app.prepare('INSERT OR REPLACE INTO status VALUES (?, ?, ?)')
    .run(key, JSON.stringify(value), Math.floor(Date.now() / 1000));
}
