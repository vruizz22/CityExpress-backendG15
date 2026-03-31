import { defineConfig } from '@prisma/config';
import * as process from 'process';

export default defineConfig({
  earlyAccess: true,
  migrate: {
    schemaPath: 'prisma/schema.prisma',
    url: process.env.DATABASE_URL,
  },
});
