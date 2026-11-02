#!/bin/sh
# Bildschirm im Schaufenster ein- oder ausschalten: bgbb-screen on | off | list
# Methode in /etc/default/bgbb-screen: cec (HDMI-CEC), wlr (Ausgang über cage), none
set -eu
[ -f /etc/default/bgbb-screen ] && . /etc/default/bgbb-screen
SCREEN_METHOD="${SCREEN_METHOD:-cec}"
WLR_OUTPUT="${WLR_OUTPUT:-HDMI-A-1}"
KIOSK_USER="${KIOSK_USER:-kiosk}"

# wlr-randr muss in der Wayland-Sitzung des Kiosk-Benutzers laufen
wlr() {
  uid="$(id -u "$KIOSK_USER")"
  runuser -u "$KIOSK_USER" -- env XDG_RUNTIME_DIR="/run/user/$uid" WAYLAND_DISPLAY=wayland-0 wlr-randr "$@"
}

case "${1:-}" in
  on)
    case "$SCREEN_METHOD" in
      cec) echo 'on 0' | cec-client -s -d 1; echo 'as' | cec-client -s -d 1 ;;
      wlr) wlr --output "$WLR_OUTPUT" --on ;;
    esac ;;
  off)
    case "$SCREEN_METHOD" in
      cec) echo 'standby 0' | cec-client -s -d 1 ;;
      wlr) wlr --output "$WLR_OUTPUT" --off ;;
    esac ;;
  list)
    wlr ;;
  *)
    echo "Aufruf: $0 on|off|list" >&2; exit 2 ;;
esac
