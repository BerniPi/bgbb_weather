#!/bin/sh
# Neue Version vom GitHub-Repo holen und die App neu starten: sudo bgbb-update
set -eu
APP_DIR="${APP_DIR:-/opt/bgbb_weather}"
cd "$APP_DIR"
git pull --ff-only
npm ci --omit=dev
systemctl restart bgbb-weather
systemctl --no-pager --lines=5 status bgbb-weather
