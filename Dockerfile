FROM node:20-alpine AS builder

# Habilitar corepack para poder usar la versión de pnpm correcta
RUN corepack enable pnpm

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY prisma ./prisma
RUN pnpx prisma generate

COPY . .
RUN pnpm run build

FROM node:20-alpine
WORKDIR /usr/src/app

RUN corepack enable pnpm
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 3000

# Usamos pnpx para ejecutar prisma deploy con pnpm
CMD ["sh", "-c", "pnpx prisma migrate deploy && pnpm run start:prod"]
