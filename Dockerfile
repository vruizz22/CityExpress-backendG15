FROM node:20-alpine AS builder

# Habilitar corepack para poder usar la versión de pnpm correcta
RUN corepack enable pnpm

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpx prisma generate

COPY . .
RUN pnpm run build

FROM node:20-alpine
WORKDIR /usr/src/app

RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.ts ./

RUN pnpx prisma generate

EXPOSE 3000

# Usamos pnpx para ejecutar prisma deploy con pnpm
CMD ["sh", "-c", "pnpx prisma migrate deploy && pnpm run start:prod"]
