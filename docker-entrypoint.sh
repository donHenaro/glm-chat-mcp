#!/bin/bash
set -e

# Start Xvfb for headless browser
Xvfb :99 -screen 0 1280x720x24 &
XVFB_PID=$!
echo "[entrypoint] Xvfb started on :99"

# Optionally start VNC server (if VNC_ENABLED=true)
if [ "${VNC_ENABLED}" = "true" ]; then
    x11vnc -display :99 -forever -nopw -listen 0.0.0.0 -rfbport 5900 &
    VNC_PID=$!
    echo "[entrypoint] VNC server started on port 5900"
fi

# Wait for Xvfb to be ready
sleep 1

# Execute the main command
exec "$@"

# Cleanup on exit
trap "kill $XVFB_PID ${VNC_PID:-} 2>/dev/null" EXIT
