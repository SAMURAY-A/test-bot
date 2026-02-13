import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The bot doesn't strictly need to listen on a port since it uses polling,
  // but NestJS apps usually listen on one.
  await app.listen(process.env.PORT ?? 3000);
  console.log('🚀 Application is running and bot is starting...');
}
bootstrap();
