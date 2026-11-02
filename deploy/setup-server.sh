#!/usr/bin/env bash
# Einrichtung des Debian-Servers: Node.js, weewx 5 (+ Meteostick, MQTT), Mosquitto,
# App-Dienst und tägliche Sicherung. Der Reverse-Proxy (Caddy, HTTPS) läuft auf einem
# anderen Server, Vorlage: deploy/config/Caddyfile. Mehrfach ausführbar.
#
#   sudo git clone https://github.com/BerniPi/bgbb_weather.git /opt/bgbb_weather
#   sudo /opt/bgbb_weather/deploy/setup-server.sh <IP des Proxy-Servers>
set -euo pipefail

PROXY_IP="${1:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER=wetter
DATA_DIR=/var/lib/bgbb-weather
BACKUP_DIR=/var/backups/bgbb-weather
NODE_MAJOR=24
CONF="$APP_DIR/deploy/config"

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo ausführen."; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

step "Grundpakete"
apt-get update
apt-get install -y ca-certificates curl gnupg git sqlite3 mosquitto mosquitto-clients

step "Node.js $NODE_MAJOR (NodeSource)"
if ! node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v

step "weewx 5 aus dem offiziellen Paketarchiv"
if [ ! -f /etc/apt/sources.list.d/weewx.list ]; then
  curl -fsSL https://weewx.com/keys.html | gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/weewx.gpg
  echo "deb [arch=all] https://weewx.com/apt/python3 buster main" > /etc/apt/sources.list.d/weewx.list
  apt-get update
fi
FIRST_WEEWX=yes
dpkg -s weewx >/dev/null 2>&1 && FIRST_WEEWX=no
# Rückfragen des Pakets überspringen – konfiguriert wird mit deploy/weewx-configure.py
DEBIAN_FRONTEND=noninteractive apt-get install -y weewx python3-paho-mqtt
if [ "$FIRST_WEEWX" = yes ]; then
  # Erst nach Konfiguration und Archiv-Übernahme starten (Erstinstallation läuft sonst als Simulator)
  systemctl stop weewx 2>/dev/null || true
  systemctl disable weewx 2>/dev/null || true
fi
usermod -aG dialout weewx   # Zugriff auf den Meteostick (USB-Seriell)

step "weewx-Erweiterungen: Meteostick-Treiber und MQTT"
if [ ! -f /etc/weewx/bin/user/meteostick.py ]; then
  weectl extension install --yes https://github.com/matthewwall/weewx-meteostick/archive/master.zip
fi
if [ ! -f /etc/weewx/bin/user/mqtt.py ]; then
  weectl extension install --yes https://github.com/matthewwall/weewx-mqtt/archive/master.zip
fi

step "Mosquitto nur auf localhost"
install -m 644 "$CONF/mosquitto-local.conf" /etc/mosquitto/conf.d/bgbb-local.conf
systemctl enable --now mosquitto
systemctl restart mosquitto

step "App-Benutzer und Verzeichnisse"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
usermod -aG weewx "$APP_USER"   # darf das weewx-Archiv lesen
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR"
install -d -m 750 "$BACKUP_DIR"

step "App-Abhängigkeiten"
cd "$APP_DIR"
npm ci --omit=dev

if [ ! -f "$APP_DIR/.env" ]; then
  step "Konfiguration $APP_DIR/.env anlegen"
  cat > "$APP_DIR/.env" <<EOF
PORT=8080
# Erreichbar für den Reverse-Proxy im Netz und den Kiosk auf localhost
HOST=0.0.0.0
TRUST_PROXY=loopback${PROXY_IP:+,$PROXY_IP}
WEEWX_DB=/var/lib/weewx/weewx.sdb
APP_DB=$DATA_DIR/app.db
JOBS=1
MQTT_URL=mqtt://localhost:1883
MQTT_TOPIC=weather/loop
LIVE_SIM=0
EOF
  chmod 644 "$APP_DIR/.env"
fi

step "Dienste: App und Sicherung"
install -m 644 "$CONF/bgbb-weather.service" /etc/systemd/system/
install -m 644 "$CONF/bgbb-weather-backup.service" "$CONF/bgbb-weather-backup.timer" /etc/systemd/system/
install -m 755 "$APP_DIR/deploy/bin/backup.sh" /usr/local/bin/bgbb-backup
install -m 755 "$APP_DIR/deploy/bin/update.sh" /usr/local/bin/bgbb-update
systemctl daemon-reload
systemctl enable bgbb-weather bgbb-weather-backup.timer
systemctl start bgbb-weather-backup.timer

step "Fertig"
cat <<EOF
Nächste Schritte (siehe deploy/INSTALL.md):
  1. weewx konfigurieren:      sudo python3 $APP_DIR/deploy/weewx-configure.py
  2. Archiv vom Pi übernehmen und Meteostick anstecken (Umzugstag)
  3. starten:                  sudo systemctl enable --now weewx && sudo systemctl start bgbb-weather
  4. Kiosk einrichten:         sudo $APP_DIR/deploy/setup-kiosk.sh
  5. Reverse-Proxy auf dem anderen Server: deploy/config/Caddyfile (Ziel http://<diese IP>:8080)
EOF
[ -n "$PROXY_IP" ] || echo "Hinweis: ohne Proxy-IP gilt nur localhost als Proxy – TRUST_PROXY in $APP_DIR/.env nachtragen."
