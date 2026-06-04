# syntax=docker/dockerfile:1
FROM node:20-slim

# Install Chromium + system fonts needed by Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use system Chromium instead of downloading its own
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy and install api-server deps
COPY api-server/package.json api-server/package-lock.json* ./api-server/
RUN cd api-server && npm ci --omit=dev

# Copy render-harness package and install its deps
COPY packages/render-harness/package.json ./packages/render-harness/
RUN cd packages/render-harness && npm install --omit=dev

# Install Playwright browsers after all deps are resolved
RUN cd api-server && npx playwright install chromium --with-deps 2>/dev/null || true

# Copy source files
COPY api-server/ ./api-server/
COPY packages/render-harness/ ./packages/render-harness/
COPY packages/visual-gate/ ./packages/visual-gate/
COPY packages/pixel-test/ ./packages/pixel-test/

# Build Storybook for the render harness (static build is more stable than dev server)
# Comment this out if using HMR dev mode instead
# RUN cd packages/render-harness && npm run build

EXPOSE 6120

# Environment variables (set at runtime, not baked in)
# ANTHROPIC_API_KEY — required
# BRAIN_MODEL — optional, defaults to claude-sonnet-4-6
# PORT — optional, defaults to 6120

CMD ["node", "api-server/server.mjs"]
