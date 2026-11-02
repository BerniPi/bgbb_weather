import express from 'express';
import { resolve } from 'node:path';
import { config, ROOT } from './config.js';
import { site } from './routes/site.js';
import { v1 } from './routes/v1.js';
import { startJobs } from './jobs.js';
import { startLive } from './live.js';

const server = express();
server.disable('x-powered-by');

server.use('/api/site', site);
server.use('/api/v1', v1);
server.use('/vendor/chart.js', express.static(resolve(ROOT, 'node_modules/chart.js/dist')));
server.use(express.static(resolve(ROOT, 'public'), { extensions: ['html'] }));

server.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Fehler' });
});

server.listen(config.port, () => {
  console.log(`BGBB Wetter läuft auf http://localhost:${config.port}`);
  if (config.jobs) startJobs();
  startLive();
});
