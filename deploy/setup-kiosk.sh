#!/usr/bin/env bash
# Kiosk für den Bildschirm im Schaufenster: automatische Anmeldung auf tty1, Chromium im
# Vollbild unter cage (Wayland), Bildschirm Mo–Fr 07:45–16:45 außer Juli/August.
# Mehrfach ausführbar.
#
#   sudo /opt/bgbb_weather/deploy/setup-kiosk.sh [cec|wlr|none]
set -euo pipefail

SCREEN_METHOD="${1:-cec}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$APP_DIR/deploy/config"
KIOSK_USER=kiosk

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo ausführen."; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

step "Pakete: cage, Chromium, Bildschirmsteuerung"
apt-get install -y cage chromium wlr-randr cec-utils curl

step "Benutzer $KIOSK_USER mit automatischer Anmeldung auf tty1"
id "$KIOSK_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$KIOSK_USER"
usermod -aG video,render,input "$KIOSK_USER"
install -d /etc/systemd/system/getty@tty1.service.d
install -m 644 "$CONF/getty-autologin.conf" /etc/systemd/system/getty@tty1.service.d/autologin.conf
install -m 755 "$APP_DIR/deploy/bin/kiosk-session.sh" /usr/local/bin/bgbb-kiosk
# Nur auf tty1 (nicht bei SSH-Anmeldung) die Kiosk-Sitzung starten
cat > "/home/$KIOSK_USER/.bash_profile" <<'EOF'
if [ "$(tty)" = "/dev/tty1" ]; then
  exec /usr/local/bin/bgbb-kiosk
fi
EOF
chown "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.bash_profile"

step "Bildschirmzeiten ($SCREEN_METHOD)"
cat > /etc/default/bgbb-screen <<EOF
# Wie der Bildschirm geschaltet wird: cec (HDMI-CEC, Fernseher), wlr (Ausgang aus/ein), none
SCREEN_METHOD=$SCREEN_METHOD
# Für wlr: Name des Ausgangs, siehe: sudo bgbb-screen list
WLR_OUTPUT=HDMI-A-1
KIOSK_USER=$KIOSK_USER
EOF
install -m 755 "$APP_DIR/deploy/bin/screen.sh" /usr/local/bin/bgbb-screen
install -m 644 "$CONF"/bgbb-screen-on.service "$CONF"/bgbb-screen-on.timer \
  "$CONF"/bgbb-screen-off.service "$CONF"/bgbb-screen-off.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bgbb-screen-on.timer bgbb-screen-off.timer

step "Fertig"
cat <<EOF
Neustart startet den Kiosk:  sudo reboot
Bildschirm testen:           sudo bgbb-screen off   /   sudo bgbb-screen on
Zeitplan anzeigen:           systemctl list-timers 'bgbb-screen*'
EOF
