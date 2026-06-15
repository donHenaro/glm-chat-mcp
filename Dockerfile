FROM mcr.microsoft.com/playwright:v1.52.0-noble

# Install Xvfb + VNC (Playwright base already has browser deps)
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

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

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/openai-bridge.js"]
