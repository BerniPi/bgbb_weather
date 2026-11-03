// Interne API für die eigenen Seiten (Startseite, Verlauf, Schaufenster).
// Formen sind auf die Diagramme zugeschnitten; für Dritte gibt es /api/v1.
import express from 'express';
import { series } from '../weather.js';
import { periodData } from '../period.js';
import { lakeChart, lakeYear } from '../lake.js';
import { climate, monthReport } from '../climate.js';
import { stationStatus } from '../station.js';
import { dayValues, countTypes, dayTypeInfo } from '../daytypes.js';
import { archiveSpan } from '../weather.js';
import { addDays, localDate } from '../time.js';
import { parseDate, parseRange, today, clampInt, badRequestHandler } from '../http.js';

export const site = express.Router();

site.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

site.get('/series', (req, res) => {
  res.json(series(clampInt(req.query.hours, 24, 1, 24 * 7)));
});

const RANGES = new Set(['day', 'week', 'month', 'year']);
site.get('/period', (req, res) => {
  const range = RANGES.has(req.query.range) ? req.query.range : 'day';
  res.json(periodData(range, parseDate(req.query.date, today())));
});

site.get('/climate', (req, res) => {
  res.json(climate());
});

site.get('/month-report', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month ?? '') ? req.query.month : today().slice(0, 7);
  res.json(monthReport(month));
});

// Tageswerte mit Kenntagen für die Seite „Tage“; Standard: aktueller Monat
site.get('/days', (req, res) => {
  const range = parseRange({ from: req.query.from ?? `${today().slice(0, 8)}01`, to: req.query.to });
  const span = archiveSpan();
  const days = dayValues(range.from, range.to);
  res.json({
    from: range.from,
    to: range.to,
    span: { first: localDate(span.first), last: localDate(span.last) },
    types: dayTypeInfo(),
    counts: countTypes(days),
    days: days.map(({ complete, nightComplete, ...d }) => d),
  });
});

site.get('/lake', (req, res) => {
  const days = clampInt(req.query.days, 28, 1, 366);
  res.json(lakeChart(addDays(today(), 1 - days), today()));
});

site.get('/lake-year', (req, res) => {
  res.json(lakeYear(clampInt(req.query.year, Number(today().slice(0, 4)), 1900, 2100)));
});

site.get('/station', (req, res) => {
  res.json(stationStatus());
});

site.use(badRequestHandler);
