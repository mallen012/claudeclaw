# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app

# Native module build deps (better-sqlite3 requires C++ toolchain)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Prevent puppeteer from downloading Chrome during npm ci
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ── Stage 2: Production runtime ───────────────────────────────────────────
FROM node:20-bookworm AS runtime

WORKDIR /app

# Python 3 (warroom/pipecat) + Chromium (whatsapp-web.js/puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    chromium \
    fonts-liberation \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Isolated Python venv for warroom (pipecat-ai[silero] pulls torch — keep separate)
COPY warroom/requirements.txt /tmp/warroom-requirements.txt
RUN python3 -m venv /opt/warroom-venv \
    && /opt/warroom-venv/bin/pip install --no-cache-dir -r /tmp/warroom-requirements.txt

# Node artifacts from builder (native .node binaries compiled for Bookworm)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Source tree (agents/, skills/, warroom/, etc.)
COPY . .

# Runtime dirs (mounted as volumes in production; pre-create so perms are right)
RUN mkdir -p store workspace/uploads .wwebjs_auth .wwebjs_cache

ENV NODE_ENV=production \
    PYTHON_BIN=/opt/warroom-venv/bin/python3 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3141 7860

CMD ["node", "dist/index.js"]
