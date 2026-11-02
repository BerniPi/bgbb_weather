// Statistik-Tabelle (Extremwerte eines Zeitraums) für Startseite und Verlauf
import { num, hm, day, compass } from './format.js';

export const row = (label, value, time = '') =>
  `<tr><td>${label}</td><td class="v">${value}</td><td class="t">${time}</td></tr>`;

const v = (e, d = 1) => num(e?.value, d);
const dir = (deg) => (deg == null ? '' : ` <span class="t">${compass(deg)}</span>`);

/**
 * Tabellenzeilen für statsDays()-Ergebnisse.
 * multiDay: Zeitpunkte mit Datum anzeigen (Woche, Monat, Jahr)
 */
export function statRows(s, { multiDay = false } = {}) {
  if (!s) return row('keine Daten', '');
  const at = (e) => (e ? (multiDay ? `${day(e.time)} ${hm(e.time)}` : hm(e.time)) : '');
  const atIf = (e) => (e?.value > 0 ? at(e) : '');
  return [
    row('Max. Temperatur', `${v(s.outTempMax)} °C`, at(s.outTempMax)),
    row('Min. Temperatur', `${v(s.outTempMin)} °C`, at(s.outTempMin)),
    row('Mittlere Temperatur', `${num(s.outTempAvg)} °C`),
    row('Max. Hitzeindex', `${v(s.heatindexMax)} °C`, at(s.heatindexMax)),
    row('Min. Windchill', `${v(s.windchillMin)} °C`, at(s.windchillMin)),
    row('Taupunkt max / min', `${v(s.dewpointMax)} / ${v(s.dewpointMin)} °C`),
    row('Luftfeuchte max / min', `${v(s.outHumidityMax, 0)} / ${v(s.outHumidityMin, 0)} %`),
    row('Luftdruck max / min', `${v(s.barometerMax)} / ${v(s.barometerMin)} hPa`),
    row('Niederschlag', `${num(s.rain)} mm`),
    row('Max. Niederschlagsrate', `${v(s.rainRateMax)} mm/h`, atIf(s.rainRateMax)),
    row('Max. Wind', `${v(s.windSpeedMax)} km/h${dir(s.windSpeedMax?.dir)}`, at(s.windSpeedMax)),
    row('Stärkste Böe', `${v(s.windGustMax)} km/h${dir(s.windGustMax?.dir)}`, at(s.windGustMax)),
    row('Max. UV-Index', v(s.UVMax), atIf(s.UVMax)),
    row('Max. Strahlung', `${v(s.radiationMax, 0)} W/m²`, atIf(s.radiationMax)),
    row('Sonnenscheindauer', `${num(s.sunshineMinutes / 60)} h`),
  ].join('');
}
