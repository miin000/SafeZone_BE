import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { types as pgTypes } from 'pg';

// PostgreSQL TIMESTAMP (without timezone) should be interpreted as UTC.
// Without this, environments running in GMT+7 can show values shifted by -7 hours.
pgTypes.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global prefix for all routes
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Enable CORS for frontend (Next.js) and mobile app
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Allow localhost on any port (development)
      if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
        return callback(null, true);
      }

      // Allow Android emulator
      if (origin.includes('10.0.2.2')) {
        return callback(null, true);
      }

      // Block other origins in production (add your production domains here)
      callback(null, true); // For now, allow all for development
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(3002);
}
bootstrap();
