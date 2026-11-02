# BGBB Wetter

Wetterstation des BG Bregenz Blumenstraße: Homepage wetter.bgblumenstrasse.at, öffentliche API,
Datenexport und die Anzeige im Schaufenster der Schule.

weewx liest die Davis Vantage Pro2 aus und schreibt ins Archiv `weewx.sdb`. Diese Node-App liest das
Archiv und liefert Seiten, API und Kiosk-Anzeige – ohne FTP, PHP oder MySQL.

| Seite | Inhalt |
|-------|--------|
| `/` | Aktuelle Werte, heute und vor einem Jahr, Bodensee, Sonne/Mond, 24-h-Diagramme |
| `/verlauf` | Tag, Woche, Monat, Jahr – jeder Zeitraum seit Februar 2018 |
| `/export` | Daten als CSV (auch für Excel) oder JSON herunterladen |
| `/api` | Dokumentation der offenen API `/api/v1` |
| `/klima` | Rekorde, Monats- und Jahreswerte, Monatsbericht |
| `/bodensee` | Wasserstand und Wassertemperatur im Jahresvergleich |
| `/station` | Station, Technik und aktueller Zustand |
| `/schule` | Anzeige im Schaufenster, mit Livewerten |

## Schnellstart

```
npm install
cp .env.example .env              # Pfade anpassen
npm run migrate -- wetter.sql     # einmalig: Bodensee/Sturm aus dem alten MySQL-Dump
npm run dev                       # http://localhost:8080
```

Benötigt Node ≥ 24 und eine Kopie von `weewx.sdb` in `data/`.

Installation auf dem Debian-Server: [deploy/INSTALL.md](deploy/INSTALL.md).
Alles Weitere für die Entwicklung – Aufbau, Datenmodell, Regeln – steht in [PROJEKTWISSEN.md](PROJEKTWISSEN.md).
