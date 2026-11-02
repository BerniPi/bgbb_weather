// Exportseite: Zeitraum, Auflösung, Messgrößen und Format wählen → Vorschau und Download über /api/v1
import { $, num, getJson, todayIso, addDaysIso } from './format.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';

const PREVIEW_ROWS = 12;

const state = {
  dataset: 'weather',
  interval: 'day',
  from: addDaysIso(todayIso(), -6),
  to: todayIso(),
  format: 'csv-de',
  fields: new Set(),
};
let meta = null; // Antwort von /api/v1/fields

// --- Zeitraum-Schnellwahl -------------------------------------------------------

function quickRange(key) {
  const today = todayIso();
  const [y, m] = today.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const lastOfMonth = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  switch (key) {
    case 'today': return [today, today];
    case '7': return [addDaysIso(today, -6), today];
    case '30': return [addDaysIso(today, -29), today];
    case 'month': return [`${y}-${pad(m)}-01`, today];
    case 'lastmonth': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return [`${py}-${pad(pm)}-01`, lastOfMonth(py, pm)];
    }
    case 'year': return [`${y}-01-01`, today];
    case 'lastyear': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    default: return [meta.span.first, today];
  }
}

// --- Abfrage-URL --------------------------------------------------------------------

function query(extra = {}) {
  const [format, csv] = state.format === 'csv-de' ? ['csv', 'de'] : [state.format === 'json' ? null : 'csv', null];
  const common = { from: state.from, to: state.to, format, csv, ...extra };
  if (state.dataset === 'lake') return API.lakeData(common);
  return API.data({ ...common, interval: state.interval, fields: [...state.fields].join(',') });
}

function validate() {
  if (!state.from || !state.to) return 'Bitte Zeitraum wählen.';
  if (state.from > state.to) return '„von“ liegt nach „bis“.';
  if (state.dataset === 'weather') {
    if (!state.fields.size) return 'Bitte mindestens eine Messgröße wählen.';
    const days = (Date.parse(state.to) - Date.parse(state.from)) / 86400000 + 1;
    if ((state.interval === 'raw' || state.interval === 'hour') && days > meta.limits.detailDays) {
      return `5-Minuten- und Stundenwerte höchstens ${meta.limits.detailDays} Tage auf einmal – bitte Zeitraum verkürzen oder Tageswerte wählen.`;
    }
  }
  return null;
}

// --- Darstellung --------------------------------------------------------------------

function setPressed(groupId, value) {
  $(groupId).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
}

function renderFields() {
  $('fields').innerHTML = meta.fields.map((f) => `
    <label><input type="checkbox" value="${f.key}"${state.fields.has(f.key) ? ' checked' : ''}>
      ${f.label}<span>${f.unit}</span></label>`).join('');
}

function renderPreview(json) {
  const cols = json.meta.columns;
  const head = `<tr>${cols.map((c) => `<th>${c.label}${c.unit ? `<br><small>${c.unit}</small>` : ''}</th>`).join('')}</tr>`;
  const cell = (c, v) => (typeof v === 'number' && c.key !== 'unix' ? num(v, Number.isInteger(v) ? 0 : 1) : (v ?? '–'));
  const body = json.data.map((r) => `<tr>${cols.map((c) => `<td>${cell(c, r[c.key])}</td>`).join('')}</tr>`).join('');
  $('preview').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  const total = json.meta.total;
  $('previewNote').textContent = total > json.data.length ? `erste ${json.data.length} von ${total.toLocaleString('de-AT')} Zeilen` : '';
  $('count').textContent = `${total.toLocaleString('de-AT')} Zeilen × ${cols.length} Spalten`;
}

let ticket = 0;
async function update() {
  setPressed('dataset', state.dataset);
  setPressed('interval', state.interval);
  $('from').value = state.from;
  $('to').value = state.to;
  $('intervalBox').hidden = state.dataset === 'lake';
  $('fieldsBox').hidden = state.dataset === 'lake';
  $('intervalHint').textContent = state.interval === 'raw' || state.interval === 'hour'
    ? `höchstens ${meta.limits.detailDays} Tage pro Download` : '';

  const error = validate();
  $('error').hidden = !error;
  $('error').textContent = error ?? '';
  $('download').setAttribute('aria-disabled', String(Boolean(error)));
  if (error) {
    $('count').textContent = '';
    return;
  }

  const url = query();
  $('download').href = `${url}${url.includes('?') ? '&' : '?'}download=1`;
  $('apiUrl').textContent = new URL(url, location.origin).href;

  const mine = ++ticket;
  const json = await getJson(query({ format: null, csv: null, preview: PREVIEW_ROWS }));
  if (mine === ticket) renderPreview(json);
}

function go(changes) {
  Object.assign(state, changes);
  update().catch((e) => {
    $('error').hidden = false;
    $('error').textContent = `Vorschau nicht möglich: ${e.message}`;
  });
}

// --- Start --------------------------------------------------------------------------

renderLayout();
meta = await getJson(API.fields);
// Voreinstellung: die gebräuchlichsten Größen
['outTemp', 'outHumidity', 'barometer', 'windSpeed', 'windGust', 'rain', 'sunshine'].forEach((k) => state.fields.add(k));
renderFields();
$('from').min = $('to').min = meta.span.first;
$('from').max = $('to').max = todayIso();

$('dataset').addEventListener('click', (e) => e.target.dataset.value && go({ dataset: e.target.dataset.value }));
$('interval').addEventListener('click', (e) => e.target.dataset.value && go({ interval: e.target.dataset.value }));
$('quick').addEventListener('click', (e) => {
  if (!e.target.dataset.quick) return;
  const [from, to] = quickRange(e.target.dataset.quick);
  go({ from, to });
});
$('from').addEventListener('change', (e) => go({ from: e.target.value }));
$('to').addEventListener('change', (e) => go({ to: e.target.value }));
$('fields').addEventListener('change', (e) => {
  if (e.target.checked) state.fields.add(e.target.value); else state.fields.delete(e.target.value);
  go({});
});
$('all').addEventListener('click', () => { meta.fields.forEach((f) => state.fields.add(f.key)); renderFields(); go({}); });
$('none').addEventListener('click', () => { state.fields.clear(); renderFields(); go({}); });
$('format').addEventListener('change', (e) => go({ format: e.target.value }));

go({});
