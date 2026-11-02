#!/usr/bin/env bash
# Opens the projector output window fullscreen in Chromium, listening to the
# server relay so a phone (or any other computer) can edit the show.
# Started at login by the desktop autostart entry that pi/install.sh writes.
PORT="${PORT:-8787}"
URL="http://localhost:${PORT}/output.html?remote&fs=1"

# Wait for the server (it starts from systemd, usually before the desktop).
for _ in $(seq 1 90); do
  curl -fs "http://localhost:${PORT}/" >/dev/null 2>&1 && break
  sleep 1
done

BROWSER="$(command -v chromium-browser || command -v chromium || command -v google-chrome || command -v google-chrome-stable)"
if [ -z "$BROWSER" ]; then
  echo "projector-mapper kiosk: no Chromium/Chrome found" >&2
  exit 1
fi

exec "$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --ignore-gpu-blocklist \
  --check-for-update-interval=31536000 \
  --user-data-dir="$HOME/.config/projector-mapper-kiosk" \
  "$URL"
