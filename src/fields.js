// Messgrößen der öffentlichen API und des Exports.
// key = weewx-Spaltenname, aggregates = sinnvolle Kennwerte bei Stunden-/Tages-/Monatswerten.

export const FIELDS = [
  { key: 'outTemp', label: 'Temperatur', unit: '°C', digits: 1, aggregates: ['avg', 'min', 'max'] },
  { key: 'dewpoint', label: 'Taupunkt', unit: '°C', digits: 1, aggregates: ['avg', 'min', 'max'] },
  { key: 'outHumidity', label: 'Luftfeuchtigkeit', unit: '%', digits: 0, aggregates: ['avg', 'min', 'max'] },
  { key: 'windchill', label: 'Windchill (gefühlte Temperatur)', unit: '°C', digits: 1, aggregates: ['avg', 'min'] },
  { key: 'heatindex', label: 'Hitzeindex', unit: '°C', digits: 1, aggregates: ['avg', 'max'] },
  { key: 'barometer', label: 'Luftdruck reduziert (Meereshöhe)', unit: 'hPa', digits: 1, aggregates: ['avg', 'min', 'max'] },
  { key: 'pressure', label: 'Luftdruck gemessen (434 m)', unit: 'hPa', digits: 1, aggregates: ['avg', 'min', 'max'] },
  { key: 'windSpeed', label: 'Windgeschwindigkeit', unit: 'km/h', digits: 1, aggregates: ['avg', 'max'] },
  { key: 'windGust', label: 'Böe', unit: 'km/h', digits: 1, aggregates: ['max'] },
  { key: 'windDir', label: 'Windrichtung', unit: '°', digits: 0, aggregates: ['avg'], note: 'Mittel als Vektormittel' },
  { key: 'rain', label: 'Niederschlag', unit: 'mm', digits: 1, aggregates: ['sum'] },
  { key: 'rainRate', label: 'Niederschlagsrate', unit: 'mm/h', digits: 1, aggregates: ['max'] },
  { key: 'radiation', label: 'Globalstrahlung', unit: 'W/m²', digits: 0, aggregates: ['avg', 'max'] },
  { key: 'UV', label: 'UV-Index', unit: '', digits: 1, aggregates: ['avg', 'max'] },
  { key: 'ET', label: 'Verdunstung', unit: 'mm', digits: 2, aggregates: ['sum'] },
  { key: 'sunshine', label: 'Sonnenscheindauer', unit: 'min', digits: 0, aggregates: ['sum'], note: 'geschätzt aus der Globalstrahlung' },
];

export const FIELD_MAP = new Map(FIELDS.map((f) => [f.key, f]));

export const AGGREGATE_LABELS = { avg: 'Mittel', min: 'Minimum', max: 'Maximum', sum: 'Summe' };

/** Feldliste aus dem Parameter ?fields=a,b,c (unbekannte werden ignoriert, leer = alle) */
export function parseFields(param) {
  const keys = String(param ?? '').split(',').map((s) => s.trim()).filter((k) => FIELD_MAP.has(k));
  return keys.length ? keys.map((k) => FIELD_MAP.get(k)) : FIELDS;
}
