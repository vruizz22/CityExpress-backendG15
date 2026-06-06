FROM node:18-alpine

WORKDIR /app

# Copiar dependencias e instalarlas
COPY package*.json ./
RUN npm install

# Copiar el resto del código fuente (la carpeta src y el tsconfig)
COPY . .

# Compilar TypeScript a JavaScript
RUN npm run build

EXPOSE 3001