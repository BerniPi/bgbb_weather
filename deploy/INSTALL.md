# Installation auf dem Debian-Server

Ziel: Die Debian-Box im Schaufenster ersetzt den Raspberry Pi. Auf ihr laufen weewx (liest den Meteostick),
Mosquitto (Livewerte), die Node-App und der Kiosk-Browser für den Bildschirm. HTTPS macht ein
Reverse-Proxy (Caddy) auf einem **anderen** Server.

```
Meteostick ─USB─> weewx ─> /var/lib/weewx/weewx.sdb ─┐
                    └─MQTT─> Mosquitto ─────────────┤
                                                    ├─> App :8080 ─> Kiosk (localhost)
Internet ─HTTPS─> Caddy (anderer Server) ───────────┘
```

Der Pi läuft bis zum Umzugstag unverändert weiter – vorher geht nichts verloren.

## Vorab klären

| Frage | Wofür |
|-------|-------|
| Feste IP der Debian-Box im Schulnetz | Ziel für den Proxy |
| IP des Proxy-Servers | `TRUST_PROXY`, Firewall |
| Darf der Proxy die Box auf Port 8080 erreichen? | sonst keine Homepage |
| DNS `wetter.bgblumenstrasse.at` → Proxy | wer stellt um, wann |
| Kann der Bildschirm HDMI-CEC? | Ein-/Ausschalten, sonst `wlr` |
| Ist das GitHub-Repo öffentlich? | sonst Zugangsschlüssel zum Klonen nötig |

Das Weather-Underground-Passwort stand im Chat – vor dem Umzug im Wunderground-Konto einen neuen Stations-Key
erzeugen und diesen bei Schritt 3 eingeben.

## 1. Debian installieren

Debian 13 (trixie), **ohne** Desktop, mit SSH-Server. Benutzer mit `sudo`. Feste IP vergeben (oder DHCP-Reservierung).

## 2. Server einrichten

```
sudo apt install -y git
sudo git clone https://github.com/BerniPi/bgbb_weather.git /opt/bgbb_weather
sudo /opt/bgbb_weather/deploy/setup-server.sh <IP-des-Proxy-Servers>
```

Installiert Node.js 24, weewx 5 mit Meteostick-Treiber und MQTT-Erweiterung, Mosquitto (nur localhost),
legt den Benutzer `wetter`, `/var/lib/bgbb-weather` und `/opt/bgbb_weather/.env` an und richtet den Dienst
`bgbb-weather` sowie die tägliche Sicherung ein. weewx bleibt noch **aus**.

## 3. weewx einstellen

```
sudo python3 /opt/bgbb_weather/deploy/weewx-configure.py --port /dev/ttyUSB0
```

Fragt das Wunderground-Passwort ab und setzt Standort, Meteostick (EU, ISS-Kanal 1, Kippwaage 0,2 mm),
Archiv in **US-Einheiten** (wie das bestehende Archiv), keine HTML-Berichte, MQTT. Sicherung der alten
`weewx.conf` liegt daneben. Stabilerer Gerätename nach dem Anstecken: `ls /dev/serial/by-id/` und mit
`--port /dev/serial/by-id/…` erneut ausführen.

## 4. Kiosk einrichten

```
sudo /opt/bgbb_weather/deploy/setup-kiosk.sh cec     # oder: wlr bzw. none
```

Benutzer `kiosk` meldet sich auf tty1 automatisch an und startet Chromium im Vollbild unter `cage` mit
`http://localhost:8080/schule/`. Stürzt der Browser ab, startet er neu.
Bildschirm: ein Mo–Fr 07:45 (Jänner–Juni, September–Dezember), aus täglich 16:45 –
Zeiten in `/etc/systemd/system/bgbb-screen-*.timer` (danach `sudo systemctl daemon-reload`).
Testen: `sudo bgbb-screen off`, `sudo bgbb-screen on`. Bei `wlr` den Ausgangsnamen mit `sudo bgbb-screen list`
ermitteln und in `/etc/default/bgbb-screen` eintragen.

## 5. Proxy auf dem anderen Server

Vorlage `deploy/config/Caddyfile`: `{{DOMAIN}}` → `wetter.bgblumenstrasse.at`, `{{UPSTREAM}}` → `<IP der Box>:8080`.
Enthält Weiterleitungen der alten Adressen (`/schule_neu.php` → `/schule/` usw.).

Empfohlen auf der Box: Port 8080 nur für den Proxy öffnen, z. B. mit nftables:

```
sudo nft add table inet bgbb
sudo nft add chain inet bgbb input '{ type filter hook input priority 0; }'
sudo nft add rule inet bgbb input tcp dport 8080 ip saddr != { 127.0.0.1, <IP-des-Proxy> } drop
sudo sh -c 'nft list ruleset > /etc/nftables.conf' && sudo systemctl enable nftables
```

## 6. Umzugstag

Vorher alles bis Schritt 5 erledigt, weewx auf der Box gestoppt.

1. **Bodensee/Sturm übernehmen:** auf dem Webspace in phpMyAdmin die Datenbank `wetter` exportieren (SQL),
   Datei auf die Box kopieren, dann
   ```
   sudo systemctl stop bgbb-weather
   sudo -u wetter node /opt/bgbb_weather/scripts/migrate-dump.js wetter.sql /var/lib/bgbb-weather
   ```
2. **weewx am Pi stoppen:** `sudo /etc/init.d/weewx stop` (bzw. `sudo systemctl stop weewx`).
3. **Archiv kopieren** (vom Pi auf die Box):
   ```
   scp pi@<pi>:/var/lib/weewx/weewx.sdb /tmp/weewx.sdb
   sudo install -o weewx -g weewx -m 664 /tmp/weewx.sdb /var/lib/weewx/weewx.sdb
   ```
4. **Meteostick umstecken** (Pi → Box). Er puffert nicht – die Lücke dauert so lange wie das Umstecken.
5. **Starten und prüfen:**
   ```
   sudo systemctl enable --now weewx
   sudo journalctl -u weewx -f                  # nach ≤ 5 min: „Added record … to database“
   mosquitto_sub -h localhost -t 'weather/#' -C 3   # Livewerte kommen an
   sudo systemctl start bgbb-weather
   curl -s localhost:8080/api/site/station        # letzte Messung aktuell?
   ```
6. **Kiosk:** `sudo reboot` – Bildschirm zeigt die Seite, oben „● LIVE“.
7. **DNS** auf den Proxy umstellen lassen, Seite von außen prüfen (auch `/schule_neu.php` → `/schule/`).
8. **Aufräumen:** Pi ausschalten (damit endet auch der FTP-Upload), alte Cronjobs auf dem Pi sind damit weg;
   Webspace und MySQL-Datenbank erst nach einigen Wochen löschen.

Zurück zum Pi, falls etwas schiefgeht: weewx auf der Box stoppen, Meteostick zurück, weewx am Pi starten.

## Betrieb

| Aufgabe | Befehl |
|---------|--------|
| Neue Version einspielen | `sudo bgbb-update` |
| App-Protokoll | `journalctl -u bgbb-weather -f` |
| weewx-Protokoll | `journalctl -u weewx -f` |
| Sicherung von Hand | `sudo bgbb-backup` (Ablage `/var/backups/bgbb-weather`, 14 Tage) |
| Zeitpläne | `systemctl list-timers 'bgbb*'` |
| Einstellungen der App | `/opt/bgbb_weather/.env`, danach `sudo systemctl restart bgbb-weather` |

**Wiederherstellen:** weewx und App stoppen, `gunzip` der gewünschten Sicherung, nach
`/var/lib/weewx/weewx.sdb` bzw. `/var/lib/bgbb-weather/app.db` kopieren (Besitzer `weewx` bzw. `wetter`), starten.

**Sicherungen extern ablegen:** `/var/backups/bgbb-weather` regelmäßig auf einen anderen Rechner kopieren
(z. B. per `rsync` vom Schulserver) – ein Defekt der Box nimmt sonst Archiv und Sicherung gemeinsam mit.
