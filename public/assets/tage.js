// Seite „Tage“: Tageswerte mit Kenntagen für einen frei wählbaren Zeitraum
import { $, num, weekday, getJson, todayIso, addDaysIso } from './format.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';
import { dayTypeChips, daysLink } from './daytypes.js';

// Spalten der Tabelle; mark: Kenntag, bei dem der Wert hervorgehoben wird
const COLUMNS = [
  { key: 'tavg', label: 'Mittel', unit: '°C' },
  { key: 'tmax', label: 'Max', unit: '°C', mark: { summer: 'warm', ice: 'cold' } },
  { key: 'tmin', label: 'Min', unit: '°C', mark: { frost: 'cold' } },
  { key: 'nightMin', label: 'Nacht-Min', unit: '°C', mark: { tropicalNight: 'warm' }, title: 'Tiefstwert der Nacht davor, 18–06 Uhr UTC' },
  { key: 'rain', label: 'Regen', unit: 'mm' },
  { key: 'sunshine', label: 'Sonne', unit: 'h', title: 'geschätzt aus der Globalstrahlung' },
  { key: 'windAvg', label: 'Wind', unit: 'km/h', title: 'Tagesmittel' },
  { key: 'wind10Max', label: 'Wind max', unit: 'km/h', title: 'höchstes 10-Minuten-Mittel' },
  { key: 'gustMax', label: 'Böe', unit: 'km/h', digits: 0 },
];

const params = new URLSearchParams(location.search);
const state = {
  from: params.get('von'),
  to: params.get('bis'),
  filter: params.get('kenntag') ?? '',
  sort: { key: 'date', dir: 1 },
};
let data = null;

function syncUrl() {
  const q = new URLSearchParams({ von: state.from, bis: state.to, ...(state.filter ? { kenntag: state.filter } : {}) });
  history.replaceState(null, '', `?${q}`);
}

const longDay = (iso) => `${weekday(iso)} ${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function presetRange(preset) {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  if (preset === 'month') return [`${today.slice(0, 8)}01`, today];
  if (preset === '30') return [addDaysIso(today, -29), today];
  if (preset === 'year') return [`${year}-01-01`, today];
  if (preset === 'lastYear') return [`${year - 1}-01-01`, `${year - 1}-12-31`];
  return [data?.span.first ?? '2018-01-01', today];
}

function renderFilter() {
  const opts = [['', 'alle Tage'], ['any', 'nur Tage mit Kenntag'], ...data.types.map((t) => [t.key, `nur ${t.plural}`])];
  $('filter').innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === state.filter ? ' selected' : ''}>${l}</option>`).join('');
}

function renderSummary() {
  const types = data.types.filter((t) => data.counts[t.key]).map((t) => ({ ...t, count: data.counts[t.key] }));
  $('summary').innerHTML = dayTypeChips(types, { href: (t) => daysLink(state.from, state.to, t.key) });
  $('summary').querySelectorAll('a').forEach((a, i) => {
    a.classList.toggle('active', types[i].key === state.filter);
    a.setAttribute('aria-pressed', String(types[i].key === state.filter));
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setFilter(state.filter === types[i].key ? '' : types[i].key);
    });
  });
  $('noTypes').hidden = types.length > 0 || !data.days.length;
  $('summaryNote').textContent = data.days.length ? `${data.days.length} Tage mit Messdaten` : '';
}

function renderTable() {
  const byKey = new Map(data.types.map((t) => [t.key, t]));
  let days = data.days;
  if (state.filter === 'any') days = days.filter((d) => d.types.length);
  else if (state.filter) days = days.filter((d) => d.types.includes(state.filter));

  const { key, dir } = state.sort;
  days = [...days].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });

  const sortAttr = (k) => (k === key ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : '');
  const head = `<thead><tr><th data-sort="date"${sortAttr('date')}>Tag</th>${COLUMNS.map((c) =>
    `<th data-sort="${c.key}"${sortAttr(c.key)}${c.title ? ` title="${c.title}"` : ''}>${c.label}<small>${c.unit}</small></th>`).join('')
  }<th class="types">Kenntage</th></tr></thead>`;

  const cell = (d, c) => {
    const cls = Object.entries(c.mark ?? {}).find(([t]) => d.types.includes(t))?.[1];
    return `<td${cls ? ` class="${cls}"` : ''}>${num(d[c.key], c.digits ?? 1)}</td>`;
  };
  const body = days.map((d) => `<tr><td><a href="/verlauf?zeitraum=tag&datum=${d.date}">${longDay(d.date)}</a></td>${
    COLUMNS.map((c) => cell(d, c)).join('')
  }<td class="types">${dayTypeChips(d.types.map((k) => byKey.get(k)))}</td></tr>`).join('');

  $('table').innerHTML = days.length
    ? `${head}<tbody>${body}</tbody>`
    : `<tbody><tr><td>${data.days.length ? 'Keine Tage für diesen Filter.' : 'Keine Messdaten in diesem Zeitraum.'}</td></tr></tbody>`;
  $('hint').textContent = state.filter && days.length !== data.days.length
    ? `${days.length} von ${data.days.length} Tagen. Kenntag-Definitionen: Maus über die Kennzeichnung halten.`
    : 'Kenntag-Definitionen: Maus über die Kennzeichnung halten. Datum anklicken für den Tagesverlauf.';
}

function setFilter(filter) {
  state.filter = filter;
  $('filter').value = filter;
  syncUrl();
  renderSummary();
  renderTable();
}

let loading = 0;
async function load() {
  const ticket = ++loading;
  if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
  $('from').value = state.from;
  $('to').value = state.to;
  syncUrl();
  $('presets').querySelectorAll('button').forEach((b) => {
    const [f, t] = presetRange(b.dataset.preset);
    b.setAttribute('aria-pressed', String(f === state.from && t === state.to));
  });
  $('table').innerHTML = '<tbody><tr><td>Lade …</td></tr></tbody>';

  const res = await getJson(API.days(state.from, state.to));
  if (ticket !== loading) return;
  data = res;
  $('from').min = $('to').min = data.span.first;
  $('from').max = $('to').max = todayIso();
  if (!$('filter').options.length) renderFilter();
  renderSummary();
  renderTable();
}

function go(update) {
  Object.assign(state, update);
  load().catch((e) => console.error(e));
}

renderLayout();
if (!state.from || !state.to) [state.from, state.to] = presetRange('month');

$('presets').addEventListener('click', (e) => {
  const p = e.target.dataset.preset;
  if (p) { const [from, to] = presetRange(p); go({ from, to }); }
});
$('from').addEventListener('change', (e) => e.target.value && go({ from: e.target.value }));
$('to').addEventListener('change', (e) => e.target.value && go({ to: e.target.value }));
$('filter').addEventListener('change', (e) => setFilter(e.target.value));
$('table').addEventListener('click', (e) => {
  const k = e.target.closest('th[data-sort]')?.dataset.sort;
  if (!k) return;
  // Datum zuerst aufsteigend, Messwerte zuerst absteigend (höchste oben)
  state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : k === 'date' ? 1 : -1 };
  renderTable();
});

go({});
