FROM node:20-alpine AS builder

# Habilitar corepack para poder usar la versión de pnpm correcta
RUN corepack enable pnpm && corepack prepare pnpm@10.11.1 --activate

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpx prisma generate

COPY . .
RUN pnpm run build

FROM node:20-alpine
WORKDIR /usr/src/app

RUN corepack enable pnpm && corepack prepare pnpm@10.11.1 --activate
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.ts ./

RUN pnpx prisma generate

EXPOSE 3000

# Migraciones al arrancar. `NODE_OPTIONS=` solo en el migrate: si no, el
# `-r newrelic` del contenedor se cuela al preinstall de prisma (contexto dlx
# sin newrelic) y crashea el arranque en loop. La app (start:prod) sí conserva
# NODE_OPTIONS=-r newrelic del entorno del contenedor.
CMD ["sh", "-c", "NODE_OPTIONS= pnpx prisma migrate deploy && pnpm run start:prod"]
