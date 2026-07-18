# syntax=docker/dockerfile:1.12
FROM node:24.11.0-bookworm-slim
LABEL org.opencontainers.image.title="OpenPreflight Runner" \
      org.opencontainers.image.licenses="GPL-2.0-or-later"
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate \
    && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl docker.io \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
USER node
CMD ["pnpm", "openpreflight", "doctor"]
