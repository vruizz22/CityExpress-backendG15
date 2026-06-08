# Multi-stage: el builder compila el TS (necesita typescript/devDeps); la imagen
# final solo lleva dependencias de producción → imagen mucho más chica → pull
# rápido en la t3.micro (antes la final cargaba serverless/esbuild/ts-node y el
# pull tardaba ~6 min, reventando el timeout del deploy).
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3001

# Por defecto corre el master (job-master). El job-worker sobreescribe el command
# a ["node","dist/worker.js"] en el compose.
CMD ["node", "dist/master.js"]
