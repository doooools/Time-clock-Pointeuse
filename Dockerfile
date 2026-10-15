# syntax=docker/dockerfile:1

# --- Build: front (Vite) + self-contained server bundle (esbuild) ---------------------------------------
# Debian-based image for the build: some dev tools (workerd, pulled by wrangler) ship glibc binaries only.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:node

# --- Runtime: Node + the built files only (no node_modules, no native dependency) ----------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/time-clock-pointeuse.db
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/server ./dist/server
COPY --from=build --chown=node:node /app/dist/client ./dist/client
# Named volumes start with the ownership of this directory, so the non-root user can write to it.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/me').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server/index.mjs"]
