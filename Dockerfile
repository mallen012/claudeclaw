# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app

# Native module build deps (better-sqlite3 compiles C++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Don't let puppeteer pull Chromium during npm ci — we install it via apt in runtime
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
# Include optional deps so the SDK's platform-native binaries are fetched
RUN npm ci --include=optional

COPY . .
RUN npm run build


# ── Stage 2: Production runtime ───────────────────────────────────────────
FROM node:20-bookworm AS runtime

WORKDIR /app

# Python 3 (War Room / Pipecat) + Chromium (WhatsApp bridge via puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    chromium \
    fonts-liberation \
    libgbm1 libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Isolated Python venv for War Room (pipecat-ai pulls torch — keep separate)
COPY warroom/requirements.txt /tmp/warroom-requirements.txt
RUN python3 -m venv /opt/warroom-venv \
    && /opt/warroom-venv/bin/pip install --no-cache-dir -r /tmp/warroom-requirements.txt

# Node artifacts from builder stage (includes SDK's platform-native binary)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Source tree (agents/, skills/, warroom/, agent.yaml, CLAUDE.md, etc.)
COPY . .

# Volume mount points — pre-created so permissions are correct
RUN mkdir -p store workspace/uploads .wwebjs_auth .wwebjs_cache

ENV NODE_ENV=production \
    PYTHON_BIN=/opt/warroom-venv/bin/python3 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3141 7860

CMD ["node", "dist/index.js"]
