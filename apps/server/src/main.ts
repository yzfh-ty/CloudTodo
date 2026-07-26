import 'dotenv/config';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertProductionSecrets, parseOrigins } from './common/config/production-guard';
import { SecurityRequestContextService } from './common/security/security-request-context.service';

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  const isProduction = process.env.NODE_ENV === 'production';

  const configuredOrigins = parseOrigins(process.env.CORS_ORIGINS);
  const allowedOrigins = isProduction
    ? configuredOrigins
    : configuredOrigins.length > 0
      ? configuredOrigins
      : undefined;

  app.enableCors({
    origin: allowedOrigins ?? ((
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
      callback(isLocalOrigin ? null : new Error('CORS origin is not allowed'), isLocalOrigin);
    }),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
  });

  const httpAdapter = app.getHttpAdapter().getInstance() as {
    set?: (name: string, value: unknown) => void;
    use: (handler: (request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => void) => void;
  };
  const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (trustedProxyIps.length > 0) {
    httpAdapter.set?.('trust proxy', trustedProxyIps);
  }

  const securityRequestContext = app.get(SecurityRequestContextService);
  httpAdapter.use((request, response, next) => {
    securityRequestContext.run(
      request as {
        ip?: string;
        socket?: { remoteAddress?: string };
        headers?: Record<string, string | string[] | undefined>;
      },
      (context) => {
        response.setHeader('X-Request-ID', context.requestId);
        next();
      },
    );
  });

  httpAdapter.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
    );
    if (isProduction) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'admin', method: RequestMethod.GET },
      { path: 'admin/login', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port);
}

bootstrap();
