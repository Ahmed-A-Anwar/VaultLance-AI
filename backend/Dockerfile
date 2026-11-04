# VaultLance API — Fly.io image.
# Build context is this directory (backend/), so every COPY is backend-relative.
# Two stages: production dependencies only, then a non-root runtime that keeps
# no build tooling. tsx is a runtime dependency (npm start), so nothing is
# compiled at boot. No secret is baked in — they arrive as Fly secrets.
FROM node:22-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p storage/vaults \
 && chown -R node:node /app

USER node
EXPOSE 8080

CMD ["npm", "start"]
