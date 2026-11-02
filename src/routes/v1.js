// Öffentliche API /api/v1 – Dokumentation unter /api
import express from 'express';
import { FIELDS, AGGREGATE_LABELS, parseFields } from '../fields.js';
import { archiveRows, archiveCount, aggregateRows, columns } from '../aggregate.js';
import { current, archiveSpan } from '../weather.js';
import { lakeNow, lakeDays } from '../lake.js';
import { storm } from '../storm.js';
import { almanac } from '../astro.js';
import { liveStream, liveEnabled } from '../live.js';
import { addDays, localDate, localToUnix } from '../time.js';
import { BadRequest, parseDate, parseRange, today, clampInt, badRequestHandler } from '../http.js';

export const v1 = express.Router();

const MAX_DAYS_DETAIL = 400; // Rohdaten und Stundenwerte
const RATE_LIMIT = 120; // Datenabfragen je Minute und IP
const INTERVALS = ['raw', 'hour', 'day', 'month', 'year'];

v1.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=60');
  next();
});

// Begrenzung nur für die Datenabfragen – die Seiten selbst rufen /current regelmäßig ab
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();
function rateLimit(req, res, next) {
  const n = (hits.get(req.ip) ?? 0) + 1;
  hits.set(req.ip, n);
  if (n <= RATE_LIMIT) return next();
  res.set('Retry-After', '60');
  return res.status(429).json({ error: `Zu viele Anfragen – höchstens ${RATE_LIMIT} pro Minute` });
}

// --- Ausgabe als JSON oder CSV ------------------------------------------------------

function toCsv(cols, rows, german) {
  const sep = german ? ';' : ',';
  const cell = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return german ? String(v).replace('.', ',') : String(v);
    return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = cols.map((c) => (german ? `${c.label}${c.unit ? ` [${c.unit}]` : ''}` : c.key)).map(cell).join(sep);
  const body = rows.map((r) => cols.map((c) => cell(r[c.key])).join(sep));
  // BOM, damit Excel UTF-8 erkennt
  return `${german ? '﻿' : ''}${[head, ...body].join('\r\n')}\r\n`;
}

/**
 * Antwort als JSON { meta, data } oder CSV (?format=csv, ?csv=de für Excel deutsch).
 * ?download=1 liefert eine Datei, ?preview=n nur die ersten n Zeilen.
 */
function send(req, res, { meta, cols, rows, filename }) {
  const preview = clampInt(req.query.preview, 0, 0, 1000);
  const out = preview ? rows.slice(0, preview) : rows;
  const csv = req.query.format === 'csv';
  if (req.query.download) res.attachment(`${filename}.${csv ? 'csv' : 'json'}`);
  if (csv) return res.type('text/csv; charset=utf-8').send(toCsv(cols, out, req.query.csv === 'de'));
  return res.json({ meta: { total: rows.length, ...meta, columns: cols }, data: out });
}

// --- Endpunkte ----------------------------------------------------------------------

v1.get('/', (req, res) => res.redirect('/api'));

v1.get('/fields', (req, res) => {
  const span = archiveSpan();
  res.json({
    fields: FIELDS,
    aggregates: AGGREGATE_LABELS,
    intervals: INTERVALS,
    span: { first: span.first && localDate(span.first), last: span.last && localDate(span.last) },
    limits: { detailDays: MAX_DAYS_DETAIL, perMinute: RATE_LIMIT },
  });
});

v1.get('/current', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ weather: current(), lake: lakeNow(), storm: storm(), almanac: almanac() });
});

v1.get('/data', rateLimit, (req, res) => {
  const interval = req.query.interval ?? 'raw';
  if (!INTERVALS.includes(interval)) throw new BadRequest(`interval: eines von ${INTERVALS.join(', ')}`);
  const range = parseRange(req.query);
  if ((interval === 'raw' || interval === 'hour') && range.days > MAX_DAYS_DETAIL) {
    throw new BadRequest(`Für interval=${interval} höchstens ${MAX_DAYS_DETAIL} Tage pro Abfrage`);
  }
  const fields = parseFields(req.query.fields);
  const meta = { station: 'BG Bregenz Blumenstraße', from: range.from, to: range.to, interval, timezone: 'Europe/Vienna' };
  const cols = columns(interval, fields);
  const filename = `wetter-bgbb_${range.from}_${range.to}_${interval}`;

  // Vorschau der Rohdaten: nur die ersten Zeilen laden, Anzahl per COUNT
  const preview = clampInt(req.query.preview, 0, 0, 1000);
  if (interval === 'raw' && preview) {
    const rows = archiveRows(range.firstDay, Math.min(range.end, range.firstDay + preview * 600), fields);
    return send(req, res, { meta: { ...meta, total: archiveCount(range.firstDay, range.end) }, cols, rows, filename });
  }

  const rows = interval === 'raw'
    ? archiveRows(range.firstDay, range.end, fields)
    : aggregateRows(interval, range.firstDay, range.lastDay, range.end, fields);
  return send(req, res, { meta, cols, rows, filename });
});

v1.get('/lake', rateLimit, (req, res) => {
  const range = parseRange({ from: req.query.from ?? addDays(today(), -27), to: req.query.to });
  send(req, res, {
    meta: { station: 'Bodensee, Pegel Bregenz', source: 'Land Vorarlberg (VoWIS)', from: range.from, to: range.to, interval: 'day' },
    cols: [
      { key: 'date', label: 'Datum', unit: '' },
      { key: 'temp05', label: 'Wassertemperatur 0,5 m', unit: '°C' },
      { key: 'temp25', label: 'Wassertemperatur 2,5 m', unit: '°C' },
      { key: 'stand', label: 'Wasserstand', unit: 'cm' },
      { key: 'stand_mit', label: 'Wasserstand langjähriges Mittel', unit: 'cm' },
    ],
    rows: lakeDays(range.from, range.to),
    filename: `bodensee_${range.from}_${range.to}`,
  });
});

// Livewerte als Server-Sent Events; ohne Quelle 404, damit Browser nicht endlos neu verbinden
v1.get('/live', (req, res) => {
  if (!liveEnabled()) return res.status(404).json({ error: 'Livewerte nicht verfügbar' });
  return liveStream(req, res);
});

v1.get('/almanac', (req, res) => {
  const date = parseDate(req.query.date, today());
  res.json({ date, ...almanac(localToUnix(date) + 12 * 3600) });
});

v1.use(badRequestHandler);
