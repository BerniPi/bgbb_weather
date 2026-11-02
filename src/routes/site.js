// Interne API für die eigenen Seiten (Startseite, Verlauf, Schaufenster).
// Formen sind auf die Diagramme zugeschnitten; für Dritte gibt es /api/v1.
import express from 'express';
import { series } from '../weather.js';
import { periodData } from '../period.js';
import { lakeChart } from '../lake.js';
import { climate, monthReport } from '../climate.js';
import { addDays } from '../time.js';
import { parseDate, today, clampInt, badRequestHandler } from '../http.js';

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

site.get('/lake', (req, res) => {
  const days = clampInt(req.query.days, 28, 1, 366);
  res.json(lakeChart(addDays(today(), 1 - days), today()));
});

site.use(badRequestHandler);
