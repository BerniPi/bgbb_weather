// Klima-Seite: Rekorde, Monats-/Jahrestabellen, Monatsbericht
import { $, num, hm, day, date, getJson, todayIso, longDate, weekday, compass } from './format.js';
import { API } from './api.js';
import { renderLayout } from './layout.js';
import { row } from './stats.js';

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Wählbare Größen der Monatstabelle; total: Jahreswert als Summe (sonst Mittel/Extrem)
const MEASURES = [
  { key: 'tavg', label: 'Mitteltemperatur', unit: '°C', digits: 1, scale: 'temp' },
  { key: 'tmax', label: 'Höchsttemperatur', unit: '°C', digits: 1, scale: 'temp' },
  { key: 'tmin', label: 'Tiefsttemperatur', unit: '°C', digits: 1, scale: 'temp' },
  { key: 'rain', label: 'Niederschlag', unit: 'mm', digits: 0, scale: 'rain' },
  { key: 'sunshine', label: 'Sonnenstunden', unit: 'h', digits: 0, scale: 'sun' },
  { key: 'rainDays', label: 'Regentage', unit: '', digits: 0, scale: 'rain', hint: 'Tage mit mindestens 1 mm Niederschlag' },
  { key: 'frostDays', label: 'Frosttage', unit: '', digits: 0, scale: 'cold', hint: 'Tiefstwert unter 0 °C' },
  { key: 'iceDays', label: 'Eistage', unit: '', digits: 0, scale: 'cold', hint: 'Höchstwert unter 0 °C' },
  { key: 'summerDays', label: 'Sommertage', unit: '', digits: 0, scale: 'warm', hint: 'Höchstwert mindestens 25 °C' },
  { key: 'hotDays', label: 'Hitzetage', unit: '', digits: 0, scale: 'warm', hint: 'Höchstwert mindestens 30 °C' },
  { key: 'tropicalNights', label: 'Tropennächte', unit: '', digits: 0, scale: 'warm', hint: 'Tiefstwert mindestens 20 °C' },
];

// Hintergrundfarbe je Wert (dezent, funktioniert hell und dunkel)
const SCALES = {
  temp: (v) => (v >= 0 ? `rgb(232 89 12 / ${Math.min(v / 25, 1) * 0.45})` : `rgb(28 126 214 / ${Math.min(-v / 8, 1) * 0.45})`),
  rain: (v, max) => `rgb(28 126 214 / ${(v / max) * 0.45})`,
  sun: (v, max) => `rgb(245 159 0 / ${(v / max) * 0.5})`,
  cold: (v, max) => `rgb(28 126 214 / ${(v / max) * 0.45})`,
  warm: (v, max) => `rgb(232 89 12 / ${(v / max) * 0.45})`,
};

let data = null;
let measure = MEASURES[0];

// --- Rekorde --------------------------------------------------------------------

function renderRecords() {
  $('records').innerHTML = data.records.map((g) => `
    <div class="card record">
      <h2>${g.title}</h2>
      <table class="values"><tbody>${g.items.map((i) => row(
        i.label,
        i.value == null ? '–' : `${num(i.value)} ${i.unit}`,
        i.time ? `${date(i.time)} ${hm(i.time)}` : i.date ? date(Date.parse(`${i.date}T12:00:00Z`) / 1000) : '',
      )).join('')}</tbody></table>
    </div>`).join('');
}

// --- Monats- und Jahrestabelle ------------------------------------------------------

function renderTable() {
  const m = measure;
  const value = (cell) => (cell == null ? null : cell[m.key]);
  const all = data.years.flatMap((y) => y.months.map(value)).filter((v) => v != null);
  const max = Math.max(...all, 1);
  const color = (v) => (v == null ? '' : ` style="background:${SCALES[m.scale](v, max)}"`);

  // Langjähriges Mittel nur aus vollständigen Monaten
  const complete = (y, i, cell) => cell && cell.days === daysInMonth(y.year, i + 1);
  const mean = MONTHS.map((_, i) => {
    const vals = data.years.filter((y) => complete(y, i, y.months[i])).map((y) => value(y.months[i]));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  const fullYears = data.years.filter((y) => y.total.days >= 365).map((y) => value(y.total));
  const meanTotal = fullYears.length ? fullYears.reduce((a, b) => a + b, 0) / fullYears.length : null;

  const head = `<thead><tr><th></th>${MONTHS.map((n) => `<th>${n}</th>`).join('')}<th class="total">Jahr</th></tr></thead>`;
  const body = data.years.map((y) => `<tr><td>${y.year}</td>${y.months.map((c, i) => {
    const v = value(c);
    const cls = c && !complete(y, i, c) ? ' class="partial" title="Monat unvollständig"' : '';
    return `<td${cls}${color(v)}>${v == null ? '' : num(v, m.digits)}</td>`;
  }).join('')}<td class="total">${num(value(y.total), m.digits)}</td></tr>`).join('');
  const meanRow = `<tr class="mean"><td>Mittel</td>${mean.map((v) => `<td>${v == null ? '' : num(v, m.digits)}</td>`).join('')}<td class="total">${meanTotal == null ? '' : num(meanTotal, m.digits)}</td></tr>`;

  $('table').innerHTML = `${head}<tbody>${body}${meanRow}</tbody>`;
  $('measureHint').textContent = [
    m.unit ? `Angaben in ${m.unit}.` : '',
    m.hint ?? '',
    'Graue Werte: Monat nicht vollständig gemessen. Mittel nur aus vollständigen Monaten bzw. Jahren.',
  ].filter(Boolean).join(' ');
  $('measure').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === m.key)));
}

// --- Monatsbericht ------------------------------------------------------------------

let reportMonth = todayIso().slice(0, 7);
let report = null;

async function loadReport() {
  report = await getJson(API.monthReport(reportMonth));
  $('month').value = report.month;
  $('nextMonth').disabled = report.next > todayIso().slice(0, 7);
  $('prevMonth').disabled = report.prev < data.span.first.slice(0, 7);
  $('toVerlauf').href = `/verlauf?zeitraum=monat&datum=${report.month}-01`;

  const v = (e, d = 1) => num(e?.value, d);
  // Im Monatsergebnis mit Datum, in den Tageszeilen nur Uhrzeit
  let withDay = false;
  const t = (e) => (e ? `<small>${withDay ? `${day(e.time)} ` : ''}${hm(e.time)}</small>` : '');
  const cells = (s) => [
    `${num(s.outTempAvg)}`,
    `${v(s.outTempMax)}${t(s.outTempMax)}`,
    `${v(s.outTempMin)}${t(s.outTempMin)}`,
    num(s.rain),
    s.rainRateMax?.value > 0 ? `${v(s.rainRateMax)}${t(s.rainRateMax)}` : '0,0',
    num(s.windSpeedAvg),
    `${v(s.windGustMax)} <small>${compass(s.windGustMax?.dir)}</small>${t(s.windGustMax)}`,
    num(s.sunshineMinutes / 60),
  ];
  const head = `<thead><tr><th>Tag</th><th>Mittel °C</th><th>Max °C</th><th>Min °C</th><th>Regen mm</th>
    <th>Max. Rate mm/h</th><th>Wind km/h</th><th>Böe km/h</th><th>Sonne h</th></tr></thead>`;
  const body = report.days.map((d) => `<tr><td>${weekday(d.date)} ${Number(d.date.slice(8))}.</td>${cells(d).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  withDay = true;
  const foot = report.total ? `<tfoot><tr><td>Monat</td>${cells(report.total).map((c) => `<td>${c}</td>`).join('')}</tr></tfoot>` : '';
  $('report').innerHTML = report.days.length ? `${head}<tbody>${body}</tbody>${foot}` : '<tr><td>Keine Messdaten in diesem Monat.</td></tr>';
}

// --- Start --------------------------------------------------------------------------

renderLayout();
$('measure').innerHTML = MEASURES.map((m) => `<button type="button" data-key="${m.key}">${m.label}</button>`).join('');
$('measure').addEventListener('click', (e) => {
  const m = MEASURES.find((x) => x.key === e.target.dataset.key);
  if (m) { measure = m; renderTable(); }
});
$('month').addEventListener('change', (e) => { if (e.target.value) { reportMonth = e.target.value; loadReport(); } });
$('prevMonth').addEventListener('click', () => { reportMonth = report.prev; loadReport(); });
$('nextMonth').addEventListener('click', () => { reportMonth = report.next; loadReport(); });

data = await getJson(API.climate);
$('since').textContent = longDate(data.span.first);
$('month').min = data.span.first.slice(0, 7);
$('month').max = todayIso().slice(0, 7);
renderRecords();
renderTable();
await loadReport();
