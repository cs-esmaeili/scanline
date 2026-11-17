#!/usr/bin/env bash
# Launch the desktop-wide search overlay.
# Bind this file to a global shortcut (KDE: System Settings -> Shortcuts ->
# Custom -> Command: /path/to/vs-search/desktop/run.sh).
set -e
cd "$(dirname "$(readlink -f "$0")")"
exec ./node_modules/.bin/electron . --ozone-platform=x11 "$@"
