# =============================================================================
# Multi-stage build option (TODO: ~2GB → ~300MB image)
# =============================================================================
# Stage 1 (build): node:20-bookworm-slim + npm ci + install deps
# Stage 2 (prod):  copy only package.json, node_modules, app code, dist/
# Base image mcr.microsoft.com/playwright:v1.52.0-noble ships browsers + system
# libs (~2GB+). A custom stage 2 with only Playwright browsers copied from
# stage 1 would cut the final image to ~300–400 MB.
# To enable: uncomment the multi-stage block below and comment out this
# single-stage definition.
# =============================================================================

FROM mcr.microsoft.com/playwright:v1.61.0-noble

# Optional: install Xvfb + x11vnc only when headed mode is needed.
# Default true for backward compatibility.
#   docker build --build-arg INSTALL_XVFB=false .
ARG INSTALL_XVFB=true
RUN if [ "${INSTALL_XVFB}" = "true" ]; then \
      apt-get update && apt-get install -y xvfb x11vnc --no-install-recommends \
        && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy application
COPY . .

# Environment defaults
ENV PORT=8102
ENV HEADLESS=true
ENV DISPLAY=:99
ENV CACHE=true
ENV CACHE_TTL=300000

# Xvfb + VNC + noVNC ports
EXPOSE 8102 5900 6080

# Startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Health check — ping the OpenAI bridge status endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8102/v1/status', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/openai-bridge.js"]
