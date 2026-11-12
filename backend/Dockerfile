FROM node:24-alpine

WORKDIR /app

# Prisma needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

EXPOSE 4100

# The local stack applies committed migrations and seeds demo accounts.
# Both steps are idempotent, so restarts are safe.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx scripts/seed-demo.ts && npx tsx src/server.ts"]
