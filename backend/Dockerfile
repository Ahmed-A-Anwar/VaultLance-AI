# VaultLance API — Fly.io image.
# Build context is this directory (backend/), so every COPY is backend-relative.
# The API runs on tsx (a runtime dependency) and keeps no schema of its own —
# Supabase owns it — so there is nothing to migrate at release time.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN mkdir -p storage/vaults

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
