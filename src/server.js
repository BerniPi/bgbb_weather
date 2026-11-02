import express from 'express';
import { resolve } from 'node:path';
import { config, ROOT } from './config.js';
import { current, series, lake, lakeSeries, storm } from './weather.js';
import { almanac } from './astro.js';
import { startJobs } from './jobs.js';

const server = express();
server.disable('x-powered-by');

const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

api.get('/current', (req, res) => {
  res.json({ weather: current(), lake: lake(), storm: storm(), almanac: almanac() });
});

api.get('/series', (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 24 * 7);
  res.json(series(hours));
});

api.get('/lake', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 28, 1), 366);
  res.json(lakeSeries(days));
});

server.use('/api', api);
server.use('/vendor/chart.js', express.static(resolve(ROOT, 'node_modules/chart.js/dist')));
server.use(express.static(resolve(ROOT, 'public'), { extensions: ['html'] }));

server.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Fehler' });
});

server.listen(config.port, () => {
  console.log(`BGBB Wetter läuft auf http://localhost:${config.port}`);
  if (config.jobs) startJobs();
});
