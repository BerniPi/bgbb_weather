// Umrechnung von Archivwerten in Anzeigeeinheiten: °C, hPa, mm, mm/h, km/h.
// Das weewx-Archiv bleibt in seinem Einheitensystem (usUnits je Datensatz):
//   1 = US (°F, inHg, inch, mph) – so speichert die Station seit 2018
//  16 = METRIC (°C, mbar, cm, km/h)
//  17 = METRICWX (°C, mbar, mm, m/s)

const GROUPS = {
  temperature: ['outTemp', 'dewpoint', 'windchill', 'heatindex', 'inTemp', 'appTemp'],
  pressure: ['barometer', 'pressure', 'altimeter'],
  rain: ['rain', 'ET'],
  rainRate: ['rainRate'],
  speed: ['windSpeed', 'windGust'],
};

const CONVERT = {
  1: {
    temperature: (f) => ((f - 32) * 5) / 9,
    pressure: (inHg) => inHg * 33.8638866667,
    rain: (inch) => inch * 25.4,
    rainRate: (inch) => inch * 25.4,
    speed: (mph) => mph * 1.609344,
  },
  16: { rain: (cm) => cm * 10, rainRate: (cm) => cm * 10 },
  17: { speed: (ms) => ms * 3.6 },
};

/** Datensatz (in-place) in Anzeigeeinheiten umrechnen */
export function toDisplay(row) {
  const conv = CONVERT[row.usUnits];
  if (!conv) return row;
  for (const [group, fn] of Object.entries(conv)) {
    for (const key of GROUPS[group]) {
      if (row[key] != null) row[key] = fn(row[key]);
    }
  }
  return row;
}
