FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY src ./src


RUN npm install && npm run build

USER node

EXPOSE 3001

# Por defecto corre el master (job-master). El job-worker sobreescribe el command
# a ["node","dist/worker.js"] en el compose. (Antes era `npm run start`, script
# inexistente → el contenedor crasheaba.)
CMD ["node", "dist/master.js"]