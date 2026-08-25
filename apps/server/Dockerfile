# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --no-frozen-lockfile --filter @tanktrouble/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @tanktrouble/shared build \
 && pnpm --filter @tanktrouble/server build \
 && pnpm --filter @tanktrouble/server --prod deploy /out

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=27491
COPY --from=build /out ./
EXPOSE 27491
CMD ["node", "dist/index.js"]
