FROM node:20-alpine

RUN corepack enable pnpm
RUN corepack prepare pnpm@10.11.1 --activate

WORKDIR /usr/src/app

COPY package.json ./
RUN pnpm install

COPY index.js ./

CMD ["pnpm", "start"]
