import { defineConfig } from '@prisma/config';

const url =
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  datasource: { url },
});
