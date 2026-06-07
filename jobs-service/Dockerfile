FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY src ./src


RUN npm install && npm run build

USER node

EXPOSE 3001

CMD ["npm", "run", "start"]