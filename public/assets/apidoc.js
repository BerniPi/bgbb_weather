// API-Dokumentation: Feldtabelle, Grenzen und Beispiele kommen aus /api/v1/fields
import { $, getJson, todayIso, addDaysIso } from './format.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';

renderLayout();
const meta = await getJson(API.fields);

$('limits').textContent = `Daten von ${meta.span.first} bis ${meta.span.last}. `
  + `5-Minuten- und Stundenwerte höchstens ${meta.limits.detailDays} Tage pro Abfrage, `
  + `höchstens ${meta.limits.perMinute} Datenabfragen pro Minute.`;

const agg = (keys) => keys.map((k) => `<code>${k}</code> <small>${meta.aggregates[k]}</small>`).join(', ');
$('fields').innerHTML = `<thead><tr><th>Feld</th><th>Bedeutung</th><th>Einheit</th><th>Kennwerte</th></tr></thead><tbody>${
  meta.fields.map((f) => `<tr><td><code>${f.key}</code></td><td>${f.label}${f.note ? ` <small>(${f.note})</small>` : ''}</td>
    <td>${f.unit}</td><td>${agg(f.aggregates)}</td></tr>`).join('')}</tbody>`;

const today = todayIso();
const year = Number(today.slice(0, 4)) - 1;
const examples = [
  [API.data({ from: addDaysIso(today, -1), to: today, fields: 'outTemp,rain' }), 'Temperatur und Niederschlag der letzten zwei Tage, 5-Minuten-Werte'],
  [API.data({ from: `${year}-01-01`, to: `${year}-12-31`, interval: 'month', fields: 'outTemp,rain,sunshine' }), `Monatswerte ${year}: Temperatur, Niederschlag, Sonnenscheindauer`],
  [API.data({ from: meta.span.first, to: today, interval: 'year', fields: 'outTemp,rain' }), 'Jahreswerte seit Beginn der Aufzeichnung'],
  [API.data({ from: `${year}-07-01`, to: `${year}-07-31`, interval: 'day', format: 'csv', csv: 'de', download: 1 }), `Alle Tageswerte Juli ${year} als CSV für Excel`],
  [API.lakeData({ from: `${year}-01-01`, to: `${year}-12-31` }), `Bodensee ${year}`],
  [API.current, 'Aktuelle Werte'],
];
$('examples').innerHTML = examples.map(([url, text]) => `<li><a href="${url}">${url}</a><span>${text}</span></li>`).join('');
