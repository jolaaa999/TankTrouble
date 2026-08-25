# syntax=docker/dockerfile:1
# Build context must be the monorepo root (see /fly.toml).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter @tanktrouble/server...

FROM base AS build
COPY --from=deps /app /app
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY tsconfig.base.json ./
RUN pnpm --filter @tanktrouble/shared build \
 && pnpm --filter @tanktrouble/server build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=27491
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/server ./apps/server
WORKDIR /app/apps/server
EXPOSE 27491
CMD ["node", "dist/index.js"]
