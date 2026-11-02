# Projektwissen BGBB Wetter

> **Pflege-Regel:** Betrifft eine Änderung etwas, das hier beschrieben ist (Datei, Tabelle, Route, Regel,
> Befehl), wird diese Datei im **selben Commit** angepasst. Nur dauerhaft gültiges Wissen, nichts für
> einzelne Aufgaben.

## Überblick

Neuaufbau von wetter.bgblumenstrasse.at: Homepage, öffentliche API, Datenexport und Anzeige im
Schaufenster der Schule. weewx liefert nur Daten, alles andere macht die Node-App.

```
Vantage Pro2 ISS ──868 MHz──> Meteostick (USB)
            Debian-Box im Schaufenster (alles auf einem Gerät)
              weewx 5 ──schreibt──> weewx.sdb (SQLite, Original-Archiv)
              Node-App ──liest──────┘   + app.db (Bodensee, Sturmwarnung, Status)
                ├─ Homepage, Export, API
                └─ /schule ◄── Chromium-Kiosk
```

| Technik | Wofür |
|---------|-------|
| Node ≥ 24 (lokal 26), ES-Module | Server, kein Build-Schritt |
| `node:sqlite` (eingebaut) | beide Datenbanken, synchron |
| Express 5 | Routen, statische Dateien |
| astronomy-engine | Sonne, Mond, Jahreszeiten |
| Chart.js (aus `node_modules`, unter `/vendor/chart.js`) | alle Diagramme, offline-fähig |
| Frontend | reines HTML/CSS/JS-Module, kein Framework, kein Bundler |

Altes System (nur Referenz, wird abgelöst): Raspberry Pi mit weewx 4.10 → Skin `BGBB_Wetter` →
FTP → `import.php` → MySQL → PHP-Seiten. Ordner daneben: `../wetter`, `../wetter_back`, `../wetter_old`, `../weewx`.

## Befehle

| Befehl | Zweck |
|--------|-------|
| `npm install` | Abhängigkeiten |
| `npm run dev` | Server mit Neustart bei Änderungen, http://localhost:8080 |
| `npm start` | Server ohne Watch (Produktion) |
| `npm run migrate -- wetter.sql` | einmalig: Bodensee/Sturm aus altem MySQL-Dump → `data/app.db` (überschreibt app.db) |

Kein Test-Framework, keine Typprüfung, kein Build. Prüfen = Server starten, Seiten und `/api/v1/*` aufrufen.

Konfiguration über `.env` (Vorlage `.env.example`): `PORT`, `WEEWX_DB`, `APP_DB`, `JOBS` (0 = keine Abrufe).
Lokal: `data/weewx.sdb` = Kopie vom Pi (`/var/lib/weewx/weewx.sdb`), `data/app.db` aus der Migration.
`data/`, `*.sdb`, `*.db`, `*.sql`, `.env` sind nicht im Repo.

## Backend (`src/`)

Einstieg `server.js`: hängt `routes/site.js` unter `/api/site`, `routes/v1.js` unter `/api/v1` ein,
liefert `public/` statisch (`/verlauf` → `verlauf.html`).

| Datei | Inhalt |
|-------|--------|
| `config.js` | `.env` laden, Pfade, Standort (Lat/Lon/Höhe) |
| `db.js` | `weewx` (nur lesend), `app` (WAL), `getStatus`/`setStatus` |
| `schema.js` | Schema von app.db (`CREATE TABLE IF NOT EXISTS`) |
| `time.js` | Ortszeit Europe/Vienna: `localToUnix`, `localDate`, `isoLocal`, `period()` (Tag/Woche/Monat/Jahr), `addDays` |
| `units.js` | `toDisplay(row)`: Archiv-Einheiten → °C, hPa, mm, km/h |
| `corrections.js` | bekannte Messfehler: `cleanRow` (Umrechnung + Fehlwerte = null), `dayExclusion`/`excludedDays` für `archive_day_*` |
| `fields.js` | Messgrößen der API: Schlüssel, Bezeichnung, Einheit, Kennwerte (`avg/min/max/sum`) |
| `sunshine.js` | Sonnenschein-Schätzung aus Strahlung (Formel der alten `lib.php`), Cache je Stunde |
| `astro.js` | `almanac()`, `sunTimes()` |
| `weather.js` | `current()`, `series()`, `seriesRange()`, `archiveSpan()` – aus 5-min-Datensätzen |
| `summaries.js` | `statsDays()` Extremwerte mit Zeitpunkt aus `archive_day_*`; `convert`, `prepared`, `sunshineByDay` |
| `aggregate.js` | `archiveRows()` (roh), `aggregateRows()` (hour/day/month/year), `columns()` – für API, Export **und** Verlauf |
| `period.js` | `periodData()` für die Verlaufsseite |
| `climate.js` | `climate()` Rekorde + Monats-/Jahrestabellen (10 min Cache), `monthReport()` |
| `lake.js` | Bodensee: `saveLake`, `lakeNow`, `lakeDays`, `lakeChart`, `lakeStats`, `lakeYear`, `floodLevels` |
| `storm.js` | Sturmwarnung: `parseStormPage`, `saveStorm`, `storm` |
| `station.js` | `stationStatus()`: letzte Messung, Empfang/Batterie 24 h, letzte Abrufe, Korrekturen |
| `jobs.js` | Abrufe alle 15 min (Bodensee) / 5 min (Sturm); nur holen, speichern in lake.js/storm.js |
| `http.js` | `parseDate`, `parseRange`, `clampInt`, `BadRequest` + Handler (400) |
| `routes/site.js` | `/api/site/series`, `/period`, `/lake`, `/lake-year`, `/climate`, `/month-report`, `/station` – für die eigenen Seiten |
| `routes/v1.js` | öffentliche API, CSV/JSON-Ausgabe, Rate-Limit |

**Regel:** Jedes Fachmodul besitzt seine Tabellen (Lesen und Schreiben). Neue Abfragen dorthin, nicht in Routen.

### Öffentliche API `/api/v1` (Doku-Seite `/api`)

| Endpunkt | Beschreibung |
|----------|--------------|
| `current` | aktuelle Werte, `today`/`lastYear` (Extremwerte), Bodensee, Sturm, Sonne/Mond |
| `data?from&to&interval&fields&format` | `interval` raw/hour/day/month/year; `format=csv`, `csv=de` (Excel), `download=1`, `preview=n` |
| `lake?from&to` | Bodensee-Tageswerte |
| `almanac?date` | Sonne und Mond |
| `fields` | Messgrößen, Kennwerte, Datenzeitraum (`span`), Grenzen (`limits`) |

Grenzen: raw/hour max. 400 Tage pro Abfrage; `/data` und `/lake` max. 120 Abfragen/min je IP; CORS `*`.
Spalten: raw = Feldname (`outTemp`), sonst `feld_kennwert` (`outTemp_avg`, `rain_sum`).

## Frontend (`public/`)

| Datei | Inhalt |
|-------|--------|
| `index.html` + `assets/aktuell.*` | Startseite |
| `verlauf.html` + `assets/verlauf.*` | Verlauf, URL `?zeitraum=tag|woche|monat|jahr&datum=JJJJ-MM-TT` |
| `bodensee.html` + `assets/bodensee.*` | Bodensee: aktuell, Jahresvergleich (`?jahr=`), historischer Bereich, Hochwasser |
| `klima.html` + `assets/klima.*` | Rekorde, Monats-/Jahrestabelle mit Kenntagen, Monatsbericht |
| `export.html` + `assets/export.*` | Export |
| `station.html` + `assets/station.*` | Station: Zustand (live), Standort, Messgeräte, Technik, Hinweise, Korrekturen |
| `api.html` + `assets/apidoc.*` | API-Doku (Feldtabelle live aus `/api/v1/fields`) |
| `schule/` | Schaufenster-Kiosk, 1920×1080, kein Scrollen, lädt sich alle 6 h neu |
| `assets/format.js` | Zahlen (de-AT, ohne Tausendertrennung), Datum/Zeit in Wien, Symbole, `$`, `dl`, `repeat`, `getJson`, `todayIso`, `addDaysIso` |
| `assets/api.js` | **alle** API-Adressen |
| `assets/layout.js` | Kopf/Navigation/Fuß; neue Seite hier eintragen (`soon: true` = ausgegraut) |
| `assets/charts.js` | alle Diagramme: `renderSeries`, `renderDaily`, `renderLake`, `renderLakeYear` (+ Hochwasserlinien), `SERIES_IDS` |
| `assets/stats.js` | Statistik-Tabelle (`statRows`) |
| `assets/panels.js` | Sonne/Mond (`almanacItems`), Sturmwarnung, `isStale` – Startseite und Kiosk |
| `assets/site.css` | Design-Tokens, Hell/Dunkel, Karten, Tabellen, Steuerelemente (`.btn`, `.seg`, `.input`, `.table-wrap`) |

Neue Seite: `<name>.html` mit `<header class="site">`/`<footer class="site">`, `site.css` + `assets/<name>.css/.js`,
`renderLayout()` aufrufen, in `layout.js` eintragen.

## Datenmodell

### `weewx.sdb` (gehört weewx, App liest nur)

- `archive`: 5-min-Datensätze seit **12.02.2018**, Schema wview_extended, Schlüssel `dateTime` (Unix)
- `archive_day_<größe>`: Tageszusammenfassungen (`min`, `mintime`, `max`, `maxtime`, `sum`, `wsum`, `sumtime`, `count`);
  `archive_day_wind` zusätzlich `max_dir`, `xsum`, `ysum` (Vektor)
- Gefüllt: outTemp, outHumidity, dewpoint, windchill, heatindex, barometer, pressure, altimeter, inTemp,
  windSpeed, windDir, windGust, windGustDir, rain, rainRate, radiation, UV, ET, rxCheckPercent, txBatteryStatus

### `app.db` (gehört der App)

| Tabelle | Schlüssel | Inhalt | Modul |
|---------|-----------|--------|-------|
| `see_data` | `dateTime` | Wassertemp. 0,5/2,5 m, Pegel (Messzeitpunkte) | lake.js |
| `see_days` | `date` | Tageswerte | lake.js |
| `see_hist` | `day` (MM-TT) | Pegel Min/Mittel/Max 1864–2024 | lake.js |
| `sturm_data` | `dateTime` | 5-min-Zeitpunkte mit Warnung Ost (40/90) | storm.js |
| `sturm_days` | `date` | Minuten Starkwind/Sturm je Tag | storm.js |
| `status` | `key` | JSON: `sturm` (letzter Stand), `see` (Hochwasser-Kennwerte) | db.js |

Migrationen: keine Versionierung. Schema in `schema.js` mit `IF NOT EXISTS`, wird beim Start angelegt.
Spalten ändern → Schema anpassen und `npm run migrate` bzw. Tabelle per Hand umbauen.

## Fachliche Regeln und Fallstricke

- **Einheiten:** Archiv in US-Einheiten (`usUnits = 1`: °F, inHg, inch, mph). Umrechnen **nur** über
  `units.js` bzw. `summaries.convert()`. weewx 5 muss beim Umzug in US-Einheiten weiterschreiben.
- **Zeitstempel = Intervallende:** Datensatz 13:00 gilt für 12:55–13:00. Stunden-Zuordnung mit `(t - 1)`.
  Abfragen daher `dateTime > von AND dateTime <= bis`.
- **Extremwerte** (heute, Vorjahr, Verlauf, Rekorde) aus `archive_day_*` – dort aus Einzelmessungen alle 2–3 s,
  stimmen mit der alten Seite überein. Aus 5-min-Mitteln wären sie zu flach.
- **Ortszeit:** Tage, Wochen (Mo–So), Monate immer Europe/Vienna; Kalenderrechnung über `time.js`.
- **Sonnenscheindauer** ist eine Schätzung aus der Strahlung (Schwelle abhängig von Tag und Uhrzeit).
- **Bodensee-Pegel** in cm am Pegel Bregenz (Nullpunkt 392,14 m ü. A.). Hochwasserlinien (HW2–HW100) erscheinen,
  sobald der Pegel bis 50 cm herankommt, plus nächste Stufe (`charts.js` `floodLines`).
- **VoWIS-Zeitpunkte** (z. B. `nnw`/`hhw` im Status `see`) sind UTC; Kalendertage (`see_days.date`) sind Ortsdatum.
- **Sturmwarnung:** Seite kttg.ch, drei Regionen; gezählt wird Region Ost (Bregenz). 40 = Starkwind, 90 = Sturm.
- **Messfehler** stehen in `corrections.js` (z. B. Böe 174 km/h am 16.05.2022 07:55). Neue Fehler dort eintragen;
  5-min-Werte werden null, Min/Max des Tages zählen nicht. Alle Datensätze daher über `cleanRow` lesen, nie `toDisplay` direkt.
- **Kenntage** (Klima): Regentag ≥ 1 mm, Frosttag Min < 0 °C, Eistag Max < 0 °C, Sommertag Max ≥ 25 °C,
  Hitzetag Max ≥ 30 °C, Tropennacht Min ≥ 20 °C. Langjährige Mittel nur aus vollständigen Monaten/Jahren.
- **`inTemp`** ist die Temperatur im Empfänger (Schaufenster), keine Raum- oder Außentemperatur.
- **Datenstand lokal:** Kopie endet zum Zeitpunkt des Kopierens → Banner „Keine aktuellen Messdaten“ ist dann korrekt.
- **Vorschau im Claude-Desktop-Browser:** Server selbst starten (`npm run dev`) und `http://localhost:8080` öffnen
  (keine `launch.json` im Projekt).

## Betrieb und Umzug (Plan)

1. Pi läuft weiter, bis alles bereit ist.
2. Debian-Box: weewx 5 + Erweiterung `weewx-meteostick` (EU, ISS-Kanal 1, Regenwippe 0,2 mm), SQLite,
   Wunderground in `[StdRESTful]`. Node-App als systemd-Dienst, Caddy/nginx davor.
3. Stichtag: weewx am Pi stoppen, `weewx.sdb` kopieren, Meteostick umstecken (puffert nicht → Lücke
   von Minuten), DNS und Kiosk umstellen.
4. Kiosk: Chromium `--kiosk http://localhost:8080/schule`; Bildschirm Mo–Fr 07:45–16:45 außer Juli/August
   per `xset dpms` / `wlr-randr` / HDMI-CEC (`cec-client`) statt `tvservice`.

## Offen

| Thema | Vorbild alte Seite |
|-------|--------------------|
| Livewerte | weewx-mqtt → Mosquitto → Node → Server-Sent Events; Loop-Pakete alle 2,5 s |

## Arbeitsweise

- Commits auf Deutsch, Betreff kurz, Aufzählung im Text; nur eigene Dateien explizit stagen.
- Keine doppelte Logik: gemeinsame Funktionen in die passenden Module (siehe Tabellen oben).
- Code und Kommentare auf Deutsch, Bezeichner englisch; Kommentardichte wie im bestehenden Code.
- Neue Seiten im Browser auf Desktop und Handy (375 px, kein horizontales Scrollen) sowie hell/dunkel prüfen.
