FROM node:20-slim

# Install dependencies for Playwright + Xvfb
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    wget \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Install Playwright browsers
RUN npx playwright install chromium --with-deps

# Copy application
COPY . .

# Environment defaults
ENV PORT=8102
ENV HEADLESS=true
ENV DISPLAY=:99
ENV CACHE=true
ENV CACHE_TTL=300000

# Xvfb + VNC ports
EXPOSE 8102 5900

# Startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/openai-bridge.js"]
