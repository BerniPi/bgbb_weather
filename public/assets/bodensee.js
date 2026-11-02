// Bodensee-Seite: aktuelle Werte, Jahresvergleich, historischer Bereich, Hochwasser-Kennwerte
import { $, num, signed, dt, date, getJson, todayIso } from './format.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';
import { setupCharts, renderLakeYear, COLORS } from './charts.js';
import { row } from './stats.js';

// 'JJJJ-MM-TT' (Kalendertag) oder ISO-Zeitpunkt mit Zone (VoWIS, UTC) → TT.MM.JJJJ in Wien
const isoDate = (iso) => {
  if (!iso) return '';
  return date(Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso) / 1000);
};
const paren = (v, d = 1) => (v == null ? '' : `(${signed(v, d)})`);
const legend = (items) => items.map(([color, text, dash]) =>
  `<span><i style="background:${color}${dash ? ';opacity:.6' : ''}"></i>${text}</span>`).join('');

function renderNow(l) {
  if (!l) { $('now').innerHTML = row('keine Daten', ''); return; }
  $('nowTime').textContent = dt(l.time);
  $('now').innerHTML = [
    row('Wasserstand', `${num(l.stand, 0)} cm`, paren(l.standDiff, 0)),
    row('Wassertemperatur 0,5 m', `${num(l.temp05)} °C`, paren(l.temp05Diff)),
    row('Wassertemperatur 2,5 m', `${num(l.temp25)} °C`, paren(l.temp25Diff)),
    l.hist ? row('Langjähriges Mittel heute', `${num(l.hist.mean, 0)} cm`, signed(l.stand - l.hist.mean, 0)) : '',
    l.hist ? row('Historisch heute min / max', `${num(l.hist.min, 0)} / ${num(l.hist.max, 0)} cm`) : '',
    l.lastYear ? row('Vor einem Jahr', `${num(l.lastYear.stand, 0)} cm · ${num(l.lastYear.temp05)} °C`) : '',
  ].join('');
}

function renderYear(d) {
  const s = d.stats;
  $('yearLabel').textContent = d.year;
  $('yearStats').innerHTML = !s.standMax ? row('keine Daten', '') : [
    row('Höchster Wasserstand', `${num(s.standMax.value, 0)} cm`, isoDate(s.standMax.date)),
    row('Niedrigster Wasserstand', `${num(s.standMin.value, 0)} cm`, isoDate(s.standMin.date)),
    row('Wärmstes Wasser', `${num(s.temp05Max.value)} °C`, isoDate(s.temp05Max.date)),
    row('Kältestes Wasser', `${num(s.temp05Min.value)} °C`, isoDate(s.temp05Min.date)),
  ].join('');

  const a = d.allTime;
  $('extremes').innerHTML = [
    a.standMax ? row(`Höchster Stand seit ${d.years[0]}`, `${num(a.standMax.value, 0)} cm`, isoDate(a.standMax.date)) : '',
    a.standMin ? row(`Tiefster Stand seit ${d.years[0]}`, `${num(a.standMin.value, 0)} cm`, isoDate(a.standMin.date)) : '',
    a.temp05Max ? row(`Wärmstes Wasser seit ${d.years[0]}`, `${num(a.temp05Max.value)} °C`, isoDate(a.temp05Max.date)) : '',
    d.extremes.highest ? row('Höchster Stand seit 1864', `${num(d.extremes.highest.wert, 0)} cm`, isoDate(d.extremes.highest.datum)) : '',
    d.extremes.lowest ? row('Tiefster Stand seit 1864', `${num(d.extremes.lowest.wert, 0)} cm`, isoDate(d.extremes.lowest.datum)) : '',
  ].join('');

  $('flood').innerHTML = `<b>Hochwasser-Kennwerte</b> ${Object.entries(d.flood).map(([k, v]) => `${k}&nbsp;${v}&nbsp;cm`).join(' · ')}`;
  $('years').innerHTML = d.years.map((y) => `<button type="button" data-year="${y}" aria-pressed="${y === d.year}">${y}</button>`).join('');
  $('standLegend').innerHTML = legend([
    [COLORS.stand, d.year], [COLORS.lake, d.year - 1, true], [COLORS.standMean, 'Mittel 1864–2024'], [`${COLORS.standMean}55`, 'Bereich 1864–2024'],
  ]);
  $('tempLegend').innerHTML = legend([[COLORS.temp, d.year], [COLORS.dew, d.year - 1, true]]);
  renderLakeYear({ stand: 'cStand', temp: 'cTemp' }, d);
}

async function loadYear(year) {
  renderYear(await getJson(API.lakeYear(year)));
  history.replaceState(null, '', `?jahr=${year}`);
}

renderLayout();
setupCharts(12);
$('years').addEventListener('click', (e) => e.target.dataset.year && loadYear(e.target.dataset.year));

const [current] = await Promise.all([
  getJson(API.current),
  loadYear(new URLSearchParams(location.search).get('jahr') ?? todayIso().slice(0, 4)),
]);
renderNow(current.lake);
