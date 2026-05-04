FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Standalone build neemt src/ niet mee — migrate-bestanden expliciet
# kopieren naar /app/migrations.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/migrations ./migrations
RUN echo "" > ./changelog.txt

RUN mkdir -p /app/.data && chown nextjs:nodejs /app/.data

USER nextjs

EXPOSE 3336
ENV PORT=3336
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
