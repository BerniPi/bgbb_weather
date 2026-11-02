// Stationsseite: Systemzustand und korrigierte Messfehler
import { $, num, dt, date, relative, getJson } from './format.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';
import { isStale } from './panels.js';
import { row } from './stats.js';

const state = (ok, text) => `<span class="${ok ? 'ok' : 'warn'}">${ok ? '●' : '▲'} ${text}</span>`;

function render(s) {
  const d = s.last24h;
  const fresh = s.last && !isStale(s.last);
  // Abrufe laufen alle 5 bzw. 15 Minuten; nach einer Stunde ohne Erfolg stimmt etwas nicht
  const jobOk = (t) => t && Date.now() / 1000 - t < 3600;
  $('checked').textContent = `Stand ${dt(Date.now() / 1000)}`;
  $('status').innerHTML = [
    row('Letzte Messung', state(fresh, relative(s.last))),
    d ? row('Datensätze letzte 24 h', `${d.records} von 288`) : '',
    d?.rxCheckPercent != null ? row('Funkempfang letzte 24 h', state(d.rxCheckPercent >= 90, `${num(d.rxCheckPercent, 0)} %`)) : '',
    d ? row('Batterie Außeneinheit', state(!d.batteryLow, d.batteryLow ? 'schwach' : 'in Ordnung')) : '',
    d?.receiverTemp != null ? row('Temperatur im Schaufenster', `${num(d.receiverTemp)} °C`) : '',
    row('Bodensee-Daten abgerufen', state(jobOk(s.jobs.lake), relative(s.jobs.lake))),
    row('Sturmwarnung abgerufen', state(jobOk(s.jobs.storm), relative(s.jobs.storm))),
    row('Messdaten seit', date(s.first)),
    row('Datensätze im Archiv', s.records.toLocaleString('de-AT')),
  ].join('');

  $('corrections').innerHTML = s.corrections.length
    ? s.corrections.map((c) => row(c.reason, '', dt(c.time))).join('')
    : row('keine', '');
}

renderLayout();
render(await getJson(API.station));
