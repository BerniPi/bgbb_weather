// Einmalige Migration: Bodensee- und Sturmdaten aus dem alten MySQL-Dump (phpMyAdmin) → app.db
//
//   node scripts/migrate-dump.js <wetter.sql> [Zielordner]
//
// Die Wetterdaten selbst kommen NICHT aus dem Dump: Quelle ist das Original-Archiv
// weewx.sdb vom Raspberry Pi (vollständiger, mehr Messgrößen).
// current, almanac, day_stats und data entfallen.
// Eine vorhandene app.db im Zielordner wird überschrieben.

import { createReadStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { APP_SCHEMA_SQL } from '../src/schema.js';
import { localToUnix } from '../src/time.js';

const dumpPath = process.argv[2];
const outDir = resolve(process.argv[3] ?? 'data');
if (!dumpPath || !existsSync(dumpPath)) {
  console.error('Aufruf: node scripts/migrate-dump.js <wetter.sql> [Zielordner]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const appFile = join(outDir, 'app.db');
for (const f of [appFile, `${appFile}-wal`, `${appFile}-shm`]) rmSync(f, { force: true });
const app = new DatabaseSync(appFile);
app.exec('PRAGMA journal_mode = WAL;');
app.exec(APP_SCHEMA_SQL);

// Eine Zeile "(v1, 'v2', NULL)," aus einem phpMyAdmin-INSERT zerlegen
function parseTuple(line) {
  const s = line.trim().replace(/^\(/, '').replace(/\)[,;]$/, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (s[i] === ' ') i++;
    if (s[i] === "'") {
      let v = '';
      i++;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\') i++;
        v += s[i++];
      }
      i++;
      out.push(v);
    } else {
      const end = s.indexOf(',', i);
      const raw = s.slice(i, end === -1 ? s.length : end).trim();
      out.push(raw === 'NULL' ? null : Number(raw));
      i = end === -1 ? s.length : end;
    }
    while (i < s.length && s[i] !== ',') i++;
    i++;
  }
  return out;
}

const insSeeDays = app.prepare('INSERT OR REPLACE INTO see_days VALUES (?, ?, ?, ?)');
const insSeeData = app.prepare('INSERT OR REPLACE INTO see_data VALUES (?, ?, ?, ?)');
const insSeeHist = app.prepare('INSERT OR REPLACE INTO see_hist VALUES (?, ?, ?, ?)');
const insSturmData = app.prepare('INSERT OR REPLACE INTO sturm_data VALUES (?, ?)');
const insSturmDays = app.prepare('INSERT OR REPLACE INTO sturm_days VALUES (?, ?, ?)');

const MIN_DATE = '2010-01-01';
const stats = {};
const count = (k) => { stats[k] = (stats[k] ?? 0) + 1; };

const handlers = {
  see_days([date, t05, t25, stand]) {
    if (date < MIN_DATE) return count('see_days_verworfen');
    insSeeDays.run(date, t05 || null, t25 || null, stand || null);
    count('see_days');
  },
  see_data([date, t05, t25, stand]) {
    if (date < MIN_DATE) return count('see_data_verworfen');
    insSeeData.run(localToUnix(date), t05 || null, t25 || null, stand || null);
    count('see_data');
  },
  see_hist([date, min, mit, max]) {
    insSeeHist.run(date.slice(5), min || null, mit || null, max || null);
    count('see_hist');
  },
  sturm_data([date, stufe]) {
    if (date < MIN_DATE) return count('sturm_data_verworfen');
    insSturmData.run(localToUnix(date), stufe);
    count('sturm_data');
  },
  sturm_days([date, stark, sturm]) {
    if (date < MIN_DATE) return count('sturm_days_verworfen');
    insSturmDays.run(date, stark, sturm);
    count('sturm_days');
  },
};

// --- Dump zeilenweise lesen ----------------------------------------------------
const rl = createInterface({ input: createReadStream(dumpPath, 'utf8'), crlfDelay: Infinity });
let table = null;
const started = Date.now();
app.exec('BEGIN');

for await (const line of rl) {
  const ins = /^INSERT INTO `(\w+)`/.exec(line);
  if (ins) {
    table = handlers[ins[1]] ? ins[1] : null;
    continue;
  }
  if (table && line.startsWith('(')) {
    handlers[table](parseTuple(line));
    if (line.trimEnd().endsWith(';')) table = null;
  }
}

app.exec('COMMIT');
app.close();

console.log(`Fertig in ${((Date.now() - started) / 1000).toFixed(1)} s → ${appFile}`);
console.table(stats);
