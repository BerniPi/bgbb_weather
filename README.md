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

## Neue Website (Plan)

| Pfad          | Inhalt |
|---------------|--------|
| `/`           | Aktuell – wie bisher inkl. „vor einem Jahr“ |
| `/verlauf`    | Tag / Woche / Monat / Jahr **und frei wählbares Datum** (jeder Tag seit 2018 abrufbar) |
| `/klima`      | Rekorde, Monats-/Jahrestabellen (Mitteltemperatur, Niederschlag, Regen-, Sommer-, Frosttage, Sonnenstunden), Monatsberichte als Tabelle statt NOAA-Text |
| `/bodensee`   | Wassertemperatur und Pegel, Jahresvergleich, historischer Mittelwert |
| `/export`     | Zeitraum, Auflösung (5 min / Stunde / Tag / Monat), Felder, Vorschau, Download CSV oder JSON |
| `/api`        | Dokumentation der öffentlichen API mit Beispielen |
| `/station`    | Station, Sensoren, Standort, Geschichte |
| `/schule`     | Schaufenster-Anzeige (fertig als erster Entwurf) |

### Öffentliche API `/api/v1` (Plan)

Alle Werte in °C, hPa, mm, mm/h, km/h, W/m²; Zeiten als ISO 8601 und Unix-Zeit.

| Endpunkt | Beschreibung |
|----------|--------------|
| `GET /api/v1/current` | aktuelle Werte + Extremwerte heute |
| `GET /api/v1/archive?from=&to=&fields=&format=json\|csv` | Rohdaten (5 min), Zeitraum begrenzt |
| `GET /api/v1/aggregate?from=&to=&interval=hour\|day\|month&fields=&format=` | Mittel/Min/Max/Summe je Intervall |
| `GET /api/v1/records` | Rekorde |
| `GET /api/v1/lake?from=&to=` | Bodensee |
| `GET /api/v1/almanac?date=` | Sonne und Mond |
| `GET /api/v1/fields` | verfügbare Felder mit Einheit und Beschreibung |

Die Exportseite nutzt dieselbe API. Ein Rate-Limit schützt den kleinen Server.

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
npm run dev                       # http://localhost:8080/schule
```

`data/weewx.sdb` = Kopie vom Pi (`/var/lib/weewx/weewx.sdb`). Datenbanken und Dumps sind
nicht im Repo.
