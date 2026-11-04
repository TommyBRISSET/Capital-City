FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-engine/package.json ./packages/game-engine/
COPY packages/ui/package.json ./packages/ui/
COPY board-packs/package.json ./board-packs/
COPY apps/realtime/package.json ./apps/realtime/
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM deps AS builder
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/board-packs ./board-packs
COPY --from=builder /app/apps/realtime ./apps/realtime
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/realtime/dist/index.js"]
