// Schema der App-eigenen Datenbank (app.db). Das weewx-Archiv legt weewx selbst an.

export const APP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS see_days (
  date TEXT PRIMARY KEY,      -- YYYY-MM-DD
  temp05 REAL,                -- Wassertemperatur 0,5 m [°C]
  temp25 REAL,                -- Wassertemperatur 2,5 m [°C]
  stand REAL                  -- Wasserstand Pegel Bregenz [cm]
);
CREATE TABLE IF NOT EXISTS see_data (
  dateTime INTEGER PRIMARY KEY,
  temp05 REAL,
  temp25 REAL,
  stand REAL
);
CREATE TABLE IF NOT EXISTS see_hist (
  day TEXT PRIMARY KEY,       -- MM-DD
  stand_min REAL,
  stand_mit REAL,
  stand_max REAL
);
CREATE TABLE IF NOT EXISTS sturm_data (
  dateTime INTEGER PRIMARY KEY,
  warnstufe INTEGER NOT NULL  -- 40 = Starkwind, 90 = Sturm (Region Ost)
);
CREATE TABLE IF NOT EXISTS sturm_days (
  date TEXT PRIMARY KEY,
  starkwind INTEGER NOT NULL, -- Minuten mit Starkwindwarnung
  sturm INTEGER NOT NULL      -- Minuten mit Sturmwarnung
);
CREATE TABLE IF NOT EXISTS status (
  key TEXT PRIMARY KEY,       -- z. B. 'sturm'
  value TEXT NOT NULL,        -- JSON
  updated INTEGER NOT NULL    -- Unix-Zeit des letzten Abrufs
);
`;
