# syntax=docker/dockerfile:1.7
# HIVE frontend image — multi-stage: docs build → vite build → nginx serve
#
# Build context is the project root (hive_project/), not hive_frontend/.
# Configure in docker-compose:
#   build: { context: ., dockerfile: hive_frontend/Dockerfile }

# ── Stage 1: build VitePress docs ────────────────────────────────────────────
FROM node:20-alpine AS docs-builder

WORKDIR /docs
COPY docs/package.json docs/package-lock.json ./
RUN npm ci
COPY docs ./
# Override the vitepress config's outDir (which writes to ../hive_frontend/public/docs)
# so the docs land somewhere we can COPY --from later.
RUN npx vitepress build --outDir /out

# ── Stage 2: build Vite SPA ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install deps first for cache reuse
COPY hive_frontend/package.json hive_frontend/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend source
COPY hive_frontend ./

# Drop the predev/prebuild lifecycle scripts that try to rebuild docs from ../docs
# (the docs are already built in the previous stage)
RUN node -e "const p=require('./package.json'); delete p.scripts.predev; delete p.scripts.prebuild; require('fs').writeFileSync('./package.json', JSON.stringify(p,null,2))"

# Drop pre-built docs from the upstream stage into public/ so Vite copies them
# verbatim into dist/docs.
COPY --from=docs-builder /out ./public/docs

# VITE_* env vars are baked into the bundle at build time. Compose can override
# the default via --build-arg VITE_API_URL=...
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Build (type-check + bundle)
RUN npx tsc -b && npx vite build

# ── Stage 3: serve via nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY hive_frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
