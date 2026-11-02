#!/usr/bin/env bash
# One-shot setup for a Raspberry Pi (or any Debian/Ubuntu box) plugged into the
# projector. Afterwards the Pi boots straight into the projector window and you
# edit the show from your phone at http://<pi-ip>:8787/
#
#   bash pi/install.sh            # server at boot + Chromium kiosk at login
#   bash pi/install.sh --no-kiosk # server only (open the output window yourself)
#   bash pi/install.sh --uninstall
#
# Re-run it any time; it overwrites what it installed before.
set -euo pipefail

PORT="${PORT:-8787}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
AUTOSTART="$HOME_DIR/.config/autostart/projector-mapper-kiosk.desktop"
UNIT=/etc/systemd/system/projector-mapper.service

if [ "${1:-}" = "--uninstall" ]; then
  sudo systemctl disable --now projector-mapper.service 2>/dev/null || true
  sudo rm -f "$UNIT"; sudo systemctl daemon-reload
  rm -f "$AUTOSTART"
  echo "Removed the service and the kiosk autostart entry. Files in $DIR were left alone."
  exit 0
fi

command -v python3 >/dev/null || { echo "python3 is required (sudo apt install python3)"; exit 1; }

# 1. Server as a system service -------------------------------------------
sed -e "s|__USER__|$USER_NAME|g" -e "s|__DIR__|$DIR|g" -e "s|__PORT__|$PORT|g" \
  "$DIR/pi/projector-mapper.service" | sudo tee "$UNIT" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now projector-mapper.service
sleep 1
if curl -fs "http://localhost:${PORT}/" >/dev/null; then
  echo "Server running on port $PORT."
else
  echo "Server did not answer on port $PORT. Check: journalctl -u projector-mapper -e"; exit 1
fi

# 2. Chromium kiosk at desktop login -------------------------------------
if [ "${1:-}" != "--no-kiosk" ]; then
  if ! command -v chromium-browser >/dev/null && ! command -v chromium >/dev/null; then
    echo "Installing Chromium..."; sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
  fi
  chmod +x "$DIR/pi/kiosk.sh"
  mkdir -p "$(dirname "$AUTOSTART")"
  cat > "$AUTOSTART" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Projector Mapper kiosk
Comment=Fullscreen projector output window
Exec=env PORT=$PORT $DIR/pi/kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP
  echo "Kiosk autostart written to $AUTOSTART"
  # Keep the projector image on: no screen blanking (Raspberry Pi OS).
  if command -v raspi-config >/dev/null; then
    sudo raspi-config nonint do_blanking 1 || true
    echo "Screen blanking disabled."
  fi
  echo "Make sure the Pi boots to the desktop with auto-login (raspi-config › System Options › Boot / Auto Login › Desktop Autologin)."
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Done. Reboot the Pi, then on your phone (same Wi-Fi) open:"
echo "   Editor:  http://${IP:-<pi-ip>}:${PORT}/"
echo "   Remote:  http://${IP:-<pi-ip>}:${PORT}/remote.html"
