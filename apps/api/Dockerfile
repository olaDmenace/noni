FROM node:26-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ── Install workspace deps ──
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN npm ci --include=dev

# ── Build ──
FROM deps AS build
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npx turbo run build --filter=@noni/api

# ── Runtime ──
FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 3000
# Apply pending migrations, then boot. Baked into the image so hosts don't need
# a start-command override (Render's dockerCommand parsing mangles quoting).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
