# BGBB Wetter

Wetterstation des BG Bregenz Blumenstraße – Neuaufbau von wetter.bgblumenstrasse.at,
öffentlicher API, Datenexport und der Anzeige im Schaufenster.

## Architektur

**Alt:** weewx (Raspberry Pi) → eigener Skin erzeugt `data.txt` → FTP-Upload auf Webspace →
`import.php` per Cron alle 2 min → MySQL → PHP-Seiten. Daneben lädt weewx eigene HTML-Seiten
(Übersicht, Station, NOAA-Berichte) hoch – eine Mischung aus generierten und Online-Dateien.

**Neu:** weewx liefert nur noch Daten, alles andere macht die Node-App.

```
Vantage Pro2 ISS ──868 MHz──> Meteostick (USB)
                                  │
            Debian-Box im Schaufenster (alles auf einem Gerät)
              weewx 5 ──schreibt──> weewx.sdb  (SQLite, Original-Archiv)
                                       │ nur lesend
              Node-App ────────────────┘  + app.db (Bodensee, Sturmwarnung)
                ├─ Homepage, Export, API
                └─ /schule  ◄── Chromium-Kiosk am Bildschirm
```

- Kein FTP, kein Skin, kein `import.php`, kein PHP, keine MySQL.
- weewx und App laufen auf demselben Rechner (SQLite-Datei wird nicht übers Netz geteilt).
- Die Anzeige im Schaufenster funktioniert auch ohne Internet.
- Wunderground-Upload bleibt in weewx (`[StdRESTful]`).

## Daten

### Wetter: `weewx.sdb` vom Pi (Quelle)

- 913 346 Datensätze, 5-Minuten-Intervall, **12.02.2018 – heute**, Schema wview_extended
- **US-Einheiten** (`usUnits = 1`: °F, inHg, inch, mph). Die App rechnet beim Lesen um
  (`src/units.js`); das Archiv bleibt unverändert.
- Gefüllte Spalten: outTemp, outHumidity, dewpoint, windchill, heatindex, barometer,
  pressure (gemessen), altimeter, inTemp, windSpeed, windDir, windGust, windGustDir,
  rain, rainRate, radiation, UV, ET, rxCheckPercent, txBatteryStatus
- weewx 5 auf Debian übernimmt die Datei direkt und schreibt in US-Einheiten weiter.
- Bekannter Ausreißer: Böe 174 km/h am 16.05.2022 07:55 (Messfehler) → für Rekorde
  ist eine Ausschlussliste vorgesehen.

### Bodensee und Sturmwarnung: `app.db`

Einmalig aus dem MySQL-Dump übernommen (`npm run migrate -- wetter.sql`), danach von der
App selbst fortgeschrieben:

| Tabelle      | Inhalt                                             | Quelle laufend              |
|--------------|----------------------------------------------------|-----------------------------|
| `see_data`   | Wassertemp. 0,5/2,5 m, Pegel, ab 12/2017           | vowis.vorarlberg.at/api/see |
| `see_days`   | Tageswerte                                         | dito (`seeArchiv`)          |
| `see_hist`   | Pegel Min/Mittel/Max je Kalendertag (1864–2024)    | dito                        |
| `sturm_data` | 5-min-Zeitpunkte mit Warnung Region Ost, ab 2/2020 | kttg.ch Sturmwarnung        |
| `sturm_days` | Minuten Starkwind/Sturm je Tag                     | berechnet                   |

Aus dem Dump entfallen `data`, `current`, `almanac`, `day_stats` – das deckt weewx.sdb ab
bzw. rechnet die App (Sonne/Mond mit astronomy-engine, Sonnenscheindauer nach der Formel der
alten `lib.php`, `src/sunshine.js`).

## Bestandsaufnahme alte Website (02.11.2026)

| Seite        | Inhalt |
|--------------|--------|
| **Aktuell**  | Aktuelle Werte (Temp., Wind Chill, Taupunkt, Feuchte, Luftdruck gemessen/reduziert, Drucktrend 3 h, Wind 10 min + Richtung, Böe, Regenrate, Regen 1 h/24 h, letzter Niederschlag, UV, Strahlung, Sonnenscheindauer, letzter Sonnenschein) · Bodensee (Wassertemp. 0,5/2,5 m, Pegel, hist. Min/Mittel/Max, Änderung zum Vortag) · Extremwerte heute mit Uhrzeit · **dieselben Werte vor einem Jahr** · Astronomie (Sonne, Mond, Phase) · 7 Diagramme 24 h |
| **Tag / Woche / Monat / Jahr** | Statistik der letzten 24 h / 7 / 31 / 365 Tage (Max/Min/Mittel mit Zeitpunkt, Regen, Sonnenscheindauer) · Bodensee Min/Max · Diagramme (Monat/Jahr als Tageswerte) |
| **Übersicht** | Rekorde seit 2018 · Beobachtungstage je Monat · Monatsberichte (NOAA-Text, Monat + Jahr) · Monatsmitteltemperatur · Monatsniederschlag · Regentage |
| **Station**  | Hardware, Laufzeit (kaum Inhalt) |
| **Export**   | Zeitraum, Detail- oder Tageswerte, Feldauswahl, Vorschau → Download |
| **schule_neu.php** | Bildschirm im Schaufenster: Aktuell + Bodensee + Astronomie + 8 Diagramme |

## Neue Website

| Pfad          | Inhalt | Stand |
|---------------|--------|-------|
| `/`           | Aktuell inkl. Heute, „vor einem Jahr“, Bodensee, Sonne/Mond, 24-h-Diagramme | fertig |
| `/verlauf`    | Tag / Woche / Monat / Jahr, jeder Zeitraum seit 2018, teilbare URL | fertig |
| `/export`     | Zeitraum, Auflösung (5 min bis Jahr), Messgrößen, Vorschau, CSV/Excel/JSON | fertig |
| `/api`        | Dokumentation der öffentlichen API mit Beispielen | fertig |
| `/schule`     | Schaufenster-Anzeige | fertig |
| `/klima`      | Rekorde, Monats-/Jahrestabellen, Monatsberichte als Tabelle statt NOAA-Text | offen |
| `/bodensee`   | Wassertemperatur und Pegel, Jahresvergleich, Hochwasser | offen |
| `/station`    | Station, Sensoren, Standort, Geschichte | offen |
| Livewerte     | Loop-Pakete alle 2,5 s per MQTT → Server-Sent Events | offen |

### Öffentliche API `/api/v1`

Alle Werte in °C, hPa, mm, mm/h, km/h, W/m²; Zeiten als ISO 8601 (Wiener Ortszeit) und Unix-Zeit.
Ausführliche Doku mit Beispielen unter `/api`.

| Endpunkt | Beschreibung |
|----------|--------------|
| `GET /api/v1/current` | aktuelle Werte, Extremwerte heute und vor einem Jahr, Bodensee, Sturm, Sonne/Mond |
| `GET /api/v1/data?from=&to=&interval=raw|hour|day|month|year&fields=&format=json|csv` | Messreihen; `csv=de` für Excel, `download=1`, `preview=n` |
| `GET /api/v1/lake?from=&to=` | Bodensee-Tageswerte |
| `GET /api/v1/almanac?date=` | Sonne und Mond |
| `GET /api/v1/fields` | Messgrößen, Einheiten, Kennwerte, Datenzeitraum, Grenzen |

5-Minuten- und Stundenwerte höchstens 400 Tage pro Abfrage, `/data` und `/lake` höchstens
120 Abfragen pro Minute und IP. CORS ist offen.

## Projektstruktur

```
src/
  server.js          Express: Router einhängen, statische Dateien
  config.js          .env, Pfade, Standort
  db.js              SQLite: weewx.sdb (nur lesen), app.db (+ status)
  schema.js          Schema von app.db
  time.js            Ortszeit Europe/Vienna, Kalenderzeiträume
  units.js           Umrechnung Archiv-Einheiten → Anzeigeeinheiten
  fields.js          Messgrößen der API (Name, Einheit, Kennwerte)
  sunshine.js        Sonnenscheinschätzung aus der Strahlung
  astro.js           Sonne, Mond, Jahreszeiten (astronomy-engine)
  weather.js         aktuelle Werte, 5-min-Verläufe
  summaries.js       Tagesstatistik aus archive_day_*
  aggregate.js       Rohdaten und Aggregate (Stunde…Jahr) – für API, Export und Verlauf
  period.js          Daten der Verlaufsseite
  lake.js            Bodensee: speichern und abfragen
  storm.js           Sturmwarnung: auswerten, speichern, abfragen
  jobs.js            regelmäßige Abrufe (nur Holen, Speichern in lake.js/storm.js)
  http.js            Request-Parameter (Datum, Zeitraum), Fehler 400
  routes/site.js     /api/site/* – interne API der eigenen Seiten
  routes/v1.js       /api/v1/*   – öffentliche API
public/
  index.html, verlauf.html, export.html, api.html, schule/
  assets/
    format.js        Zahlen, Datum, Symbole, kleine DOM-Helfer
    api.js           alle API-Adressen
    layout.js        Kopf und Fuß
    charts.js        alle Diagramme (Chart.js)
    stats.js         Statistik-Tabelle
    panels.js        Sonne/Mond, Sturmwarnung, Aktualität (Startseite + Schaufenster)
    site.css         Design, Steuerelemente; je Seite ergänzend <seite>.css/.js
scripts/
  migrate-dump.js    einmalig: Bodensee/Sturm aus altem MySQL-Dump
```

## Umstieg ohne Datenverlust

1. Pi läuft unverändert weiter und sammelt Daten.
2. Neue App mit Kopie der `weewx.sdb` entwickeln.
3. Debian-Box vorbereiten: weewx 5 + Meteostick-Treiber (`weewx-meteostick`), Datenbank = SQLite.
4. Stichtag: weewx am Pi stoppen, aktuelle `weewx.sdb` auf den Debian kopieren, Meteostick
   umstecken, weewx starten (Lücke nur wenige Minuten, der Meteostick puffert nicht).
   DNS und Kiosk umstellen.

## Schaufenster-Bildschirm

Schultage (Mo–Fr, nicht Juli/August) 07:45–16:45 ein. Ersatz für `tvservice`/`chvt`
auf Debian: `xset dpms` / `wlr-randr` bzw. HDMI-CEC (`cec-client`).

## Entwicklung

```
npm install
cp .env.example .env              # Pfade anpassen
npm run migrate -- wetter.sql     # einmalig: Bodensee/Sturm → data/app.db
npm run dev                       # http://localhost:8080
```

`data/weewx.sdb` = Kopie vom Pi (`/var/lib/weewx/weewx.sdb`). Datenbanken und Dumps sind
nicht im Repo.
