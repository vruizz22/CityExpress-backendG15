import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';

// Niveles de log. En prod NO se incluye 'debug'/'verbose': el subscriber del
// broker logea CADA mensaje entrante, y con la tormenta de la cola compartida
// (otras ciudades spammean `request`/`ack` decenas de veces por segundo) eso
// satura stdout → el buffer de escritura se acumula en el heap → OOM del master.
// Configurable con LOG_LEVEL (csv, ej. "error,warn,log,debug"); por defecto sin
// debug en producción.
function resolveLogLevels(): LogLevel[] {
  const fromEnv = process.env.LOG_LEVEL;
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean) as LogLevel[];
  }
  return process.env.NODE_ENV === 'production'
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: resolveLogLevels(),
  });
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://app.andresitowan.com',
      'https://d2emu55e9ka9fs.cloudfront.net',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
