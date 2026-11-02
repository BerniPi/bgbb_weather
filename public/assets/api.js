// Alle Adressen der Server-API an einer Stelle
export const API = {
  // interne Seiten-API (auf die Diagramme zugeschnitten)
  series: (hours = 24) => `/api/site/series?hours=${hours}`,
  lake: (days = 28) => `/api/site/lake?days=${days}`,
  period: (range, date) => `/api/site/period?range=${range}&date=${date}`,
  climate: '/api/site/climate',
  station: '/api/site/station',
  lakeYear: (year) => `/api/site/lake-year?year=${year}`,
  monthReport: (month) => `/api/site/month-report?month=${month}`,

  // öffentliche API
  current: '/api/v1/current',
  live: '/api/v1/live',
  fields: '/api/v1/fields',
  /** /api/v1/data bzw. /api/v1/lake mit Parametern; leere Werte werden weggelassen */
  data: (params) => withQuery('/api/v1/data', params),
  lakeData: (params) => withQuery('/api/v1/lake', params),
};

function withQuery(path, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== false));
  // Kommas in Feldlisten lesbar lassen
  return q.size ? `${path}?${q.toString().replace(/%2C/g, ',')}` : path;
}
