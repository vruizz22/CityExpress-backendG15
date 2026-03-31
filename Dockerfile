FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN pnpm run build

FROM node:20-alpine
WORKDIR /usr/src/app
# Instalar pnpm y prisma local para correr migraciones
RUN npm install -g pnpm
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 3000

# Primero corre la migración de Prisma asegurando la BD y luego levanta nest
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
