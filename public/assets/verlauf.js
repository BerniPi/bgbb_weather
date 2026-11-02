// Verlaufsseite: Tag / Woche / Monat / Jahr für jeden Zeitraum seit Beginn der Aufzeichnung
import { $, num, longDate, getJson, todayIso } from './format.js';
import { setupCharts, renderSeries, renderDaily, renderLake, SERIES_IDS } from './charts.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';
import { row, statRows } from './stats.js';

// URL-Parameter deutsch, intern englisch wie die API
const RANGE_PARAM = { day: 'tag', week: 'woche', month: 'monat', year: 'jahr' };
const PARAM_RANGE = Object.fromEntries(Object.entries(RANGE_PARAM).map(([k, v]) => [v, k]));

const monthYearFmt = new Intl.DateTimeFormat('de-AT', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const dayMonthFmt = new Intl.DateTimeFormat('de-AT', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const utc = (iso) => new Date(`${iso}T00:00:00Z`);

function isoWeek(iso) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

function title({ range, first, last }) {
  if (range === 'day') return longDate(first);
  if (range === 'month') return monthYearFmt.format(utc(first));
  if (range === 'year') return first.slice(0, 4);
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const from = sameMonth ? `${Number(first.slice(8))}.` : dayMonthFmt.format(utc(first));
  return `KW ${isoWeek(first)} · ${from} – ${dayMonthFmt.format(utc(last))} ${last.slice(0, 4)}`;
}

const state = {
  range: PARAM_RANGE[new URLSearchParams(location.search).get('zeitraum')] ?? 'day',
  date: new URLSearchParams(location.search).get('datum') ?? todayIso(),
};

function syncUrl() {
  const params = new URLSearchParams({ zeitraum: RANGE_PARAM[state.range], datum: state.date });
  history.replaceState(null, '', `?${params}`);
}

function renderTiles(range, stats, daily) {
  const tile = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
  const tiles = [
    tile('Mitteltemperatur', `${num(stats.outTempAvg)} °C`),
    tile('Niederschlag', `${num(stats.rain)} mm`),
    tile('Sonnenschein', `${num(stats.sunshineMinutes / 60)} h`),
    tile('Stärkste Böe', `${num(stats.windGustMax?.value, 0)} km/h`),
  ];
  if (daily?.length) {
    const count = (fn) => daily.filter(fn).length;
    tiles.push(
      tile('Regentage (≥ 1 mm)', count((d) => d.rain_sum >= 1)),
      tile('Frosttage (Min < 0 °C)', count((d) => d.outTemp_min < 0)),
      tile('Sommertage (Max ≥ 25 °C)', count((d) => d.outTemp_max >= 25)),
      tile('Hitzetage (Max ≥ 30 °C)', count((d) => d.outTemp_max >= 30)),
    );
  } else {
    tiles.push(
      tile('Temperatur max', `${num(stats.outTempMax?.value)} °C`),
      tile('Temperatur min', `${num(stats.outTempMin?.value)} °C`),
    );
  }
  $('tiles').innerHTML = tiles.join('');
}

function renderLakeStats(s) {
  const d = (e) => (e?.date ? `${e.date.slice(8)}.${e.date.slice(5, 7)}.` : '');
  $('lake').innerHTML = !s?.temp05Max ? row('keine Daten', '') : [
    row('Wassertemperatur max', `${num(s.temp05Max.value)} °C`, d(s.temp05Max)),
    row('Wassertemperatur min', `${num(s.temp05Min.value)} °C`, d(s.temp05Min)),
    row('Wasserstand max', `${num(s.standMax.value, 0)} cm`, d(s.standMax)),
    row('Wasserstand min', `${num(s.standMin.value, 0)} cm`, d(s.standMin)),
  ].join('');
}

let loading = 0;
let current = null; // zuletzt geladener Zeitraum (für Vor/Zurück)
async function load() {
  const ticket = ++loading;
  syncUrl();
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === state.range)));
  $('date').value = state.date;

  const data = await getJson(API.period(state.range, state.date));
  if (ticket !== loading) return; // schneller weitergeklickt
  const p = data.period;
  current = p;
  $('title').textContent = title(p);
  $('prev').disabled = p.prev < data.firstData;
  $('next').disabled = p.next > data.lastData;
  $('date').min = data.firstData;
  $('date').max = data.lastData;
  $('firstData').textContent = longDate(data.firstData);

  const empty = !data.stats;
  $('empty').hidden = !empty;
  $('content').hidden = empty;
  if (empty) return;

  const multiDay = p.range !== 'day';
  $('statsNote').textContent = p.last >= data.lastData && p.first <= data.lastData ? 'bis jetzt' : '';
  $('stats').innerHTML = statRows(data.stats, { multiDay });
  renderTiles(p.range, data.stats, data.daily);
  renderLakeStats(data.lake.stats);

  const intraday = Boolean(data.series);
  $('intraday').hidden = !intraday;
  $('daily').hidden = intraday;
  if (intraday) {
    renderSeries(SERIES_IDS, data.series, { stepHours: p.range === 'week' ? 24 : 3 });
    renderLake('cLake', data.lake);
  } else {
    renderDaily({ temp: 'dTemp', rain: 'dRain', wind: 'dWind', baro: 'dBaro', hum: 'dHum', sun: 'dSun' }, data.daily);
    renderLake('dLake', data.lake);
  }
}

function go(update) {
  Object.assign(state, update);
  load().catch((e) => console.error(e));
}

renderLayout();
setupCharts(12);

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => go({ range: b.dataset.range })));
$('prev').addEventListener('click', () => current && go({ date: current.prev }));
$('next').addEventListener('click', () => current && go({ date: current.next }));
$('today').addEventListener('click', () => go({ date: todayIso() }));
$('date').addEventListener('change', (e) => e.target.value && go({ date: e.target.value }));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  if (e.key === 'ArrowLeft' && !$('prev').disabled) $('prev').click();
  if (e.key === 'ArrowRight' && !$('next').disabled) $('next').click();
});

go({});
