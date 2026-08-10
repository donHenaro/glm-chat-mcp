#!/bin/bash
set -e

# Start Xvfb for headless browser (skip if not installed)
if command -v Xvfb >/dev/null 2>&1; then
    Xvfb :99 -screen 0 1280x720x24 &
    XVFB_PID=$!
    echo "[entrypoint] Xvfb started on :99"

    # Wait for Xvfb to be ready
    sleep 1
else
    echo "[entrypoint] Xvfb not installed — skipping display server"
fi

# Optionally start VNC server (if VNC_ENABLED=true)
if [ "${VNC_ENABLED}" = "true" ]; then
    if command -v x11vnc >/dev/null 2>&1; then
        x11vnc -display :99 -forever -nopw -listen 0.0.0.0 -rfbport 5900 &
        VNC_PID=$!
        echo "[entrypoint] VNC server started on port 5900"

        # Start noVNC (web-based VNC viewer) via sidecar container
        # Access at http://localhost:6080/vnc.html
        echo "[entrypoint] VNC available at vnc://localhost:5900 or http://localhost:6080/vnc.html"
    else
        echo "[entrypoint] VNC_ENABLED=true but x11vnc not installed — skipping VNC"
    fi
fi

# Cleanup on exit
trap "kill ${XVFB_PID:-} ${VNC_PID:-} 2>/dev/null" EXIT

# Execute the main command
exec "$@"
