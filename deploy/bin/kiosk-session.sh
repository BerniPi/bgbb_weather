#!/bin/sh
# Kiosk-Sitzung: wartet auf die App und startet Chromium im Vollbild unter cage.
# Beendet sich Chromium, startet die automatische Anmeldung auf tty1 alles neu.
URL="${KIOSK_URL:-http://localhost:8080/schule/}"

until curl -fs -o /dev/null "$URL"; do sleep 3; done

exec cage -d -- chromium \
  --kiosk "$URL" \
  --ozone-platform=wayland \
  --noerrdialogs --disable-infobars --no-first-run \
  --disable-session-crashed-bubble --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --incognito
