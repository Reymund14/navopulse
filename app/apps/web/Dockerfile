# Build from the repository root:  docker build -f apps/web/Dockerfile -t navopulse-web .
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# "tools" target: has the full workspace + dev deps, used to run migrations and seeds.
FROM deps AS tools
COPY . .
WORKDIR /repo/apps/web

FROM tools AS build
# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_SMS_GATEWAY_NUMBER NEXT_PUBLIC_MAP_TILE_URL NEXT_PUBLIC_MAP_ATTRIBUTION \
    NEXT_PUBLIC_HOTLINE_DRRMO NEXT_PUBLIC_HOTLINE_PNP NEXT_PUBLIC_HOTLINE_BFP NEXT_PUBLIC_DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SMS_GATEWAY_NUMBER=$NEXT_PUBLIC_SMS_GATEWAY_NUMBER NEXT_PUBLIC_MAP_TILE_URL=$NEXT_PUBLIC_MAP_TILE_URL \
    NEXT_PUBLIC_MAP_ATTRIBUTION=$NEXT_PUBLIC_MAP_ATTRIBUTION NEXT_PUBLIC_HOTLINE_DRRMO=$NEXT_PUBLIC_HOTLINE_DRRMO \
    NEXT_PUBLIC_HOTLINE_PNP=$NEXT_PUBLIC_HOTLINE_PNP NEXT_PUBLIC_HOTLINE_BFP=$NEXT_PUBLIC_HOTLINE_BFP NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN addgroup -S navopulse && adduser -S navopulse -G navopulse && mkdir -p /data/storage && chown -R navopulse /data
COPY --from=build --chown=navopulse /repo/apps/web/.next/standalone ./
COPY --from=build --chown=navopulse /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=navopulse /repo/apps/web/public ./apps/web/public
USER navopulse
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
