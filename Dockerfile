# VaultLance API — Fly.io image.
# The API runs on tsx (a runtime dependency), talks to Supabase for storage and
# keeps no schema of its own here, so there is nothing to migrate at release.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN mkdir -p storage/vaults

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
