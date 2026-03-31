FROM node:20-alpine

RUN corepack enable pnpm

WORKDIR /usr/src/app

COPY package.json ./
RUN pnpm install

COPY index.js ./

CMD ["pnpm", "start"]
