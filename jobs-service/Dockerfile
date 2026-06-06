FROM node:18-alpine

WORKDIR /app

# Copiamos absolutamente todo primero
COPY . .

# Unimos la instalación y la compilación en una sola capa
RUN npm install && npm run build

EXPOSE 3001