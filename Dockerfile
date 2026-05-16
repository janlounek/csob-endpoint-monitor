FROM node:22-slim

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libwayland-client0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

# Install only Chromium for Playwright
RUN npx playwright install chromium

COPY . .

EXPOSE 3000

# Seed runs at container start, not build time. It's idempotent: it populates
# the CSOB starter data only when the DB is empty, otherwise exits silently.
# Critical: with no Railway Volume mounted, the DB lives on the container's
# writable layer and is discarded on every redeploy — set DB_PATH to a path
# on a mounted volume (e.g. /data/monitor.db) so customizations persist.
CMD ["sh", "-c", "node seed.js && node server.js"]
