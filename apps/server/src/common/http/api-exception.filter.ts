import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface ErrorBody {
  code: string;
  message: string;
}

const PRISMA_ERROR_MAP: Record<string, { status: number; body: ErrorBody }> = {
  // "Inconsistent column data" — most often a malformed UUID reaching the
  // query layer because a route parameter was never validated.
  P2023: {
    status: HttpStatus.BAD_REQUEST,
    body: { code: 'VALIDATION_ERROR', message: 'invalid request parameter' },
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    body: { code: 'NOT_FOUND', message: 'resource not found' },
  },
  P2002: {
    status: HttpStatus.CONFLICT,
    body: { code: 'CONFLICT', message: 'resource already exists' },
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    body: { code: 'VALIDATION_ERROR', message: 'invalid request parameter' },
  },
};

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Guarantees the `{code, message}` response contract for every failure. Without
 * it a Prisma error such as a malformed UUID escapes as a 500 carrying database
 * text, and pipe errors answer in Nest's `{statusCode, message, error}` shape
 * that neither client can read.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
      headersSent?: boolean;
    }>();
    const { status, body } = this.describe(exception);

    if (response.headersSent) {
      // A guard that answers the request itself and then returns false leaves
      // Nest throwing after the response is on the wire; writing again would
      // only raise ERR_HTTP_HEADERS_SENT.
      this.logger.warn(
        `exception raised after the response was sent: ${body.code}`,
      );
      return;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const request = http.getRequest<{ method?: string; url?: string }>();
      this.logger.error(
        `unhandled error on ${request?.method ?? '?'} ${request?.url ?? '?'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        body: this.normalizeHttpBody(exception),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_MAP[exception.code];
      if (mapped) {
        return mapped;
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: 'VALIDATION_ERROR', message: 'invalid request parameter' },
      };
    }

    // Anything else is a bug rather than a client problem, and its message may
    // carry connection strings or row content.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'internal server error' },
    };
  }

  private normalizeHttpBody(exception: HttpException): ErrorBody {
    const payload = exception.getResponse();
    const status = exception.getStatus();
    const fallbackCode = STATUS_CODES[status] ?? 'INTERNAL_ERROR';

    if (typeof payload === 'string') {
      return { code: fallbackCode, message: payload };
    }

    const record = payload as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return { code: record.code, message: record.message };
    }

    const rawMessage = record.message ?? exception.message;
    return {
      code: typeof record.code === 'string' ? record.code : fallbackCode,
      message: Array.isArray(rawMessage)
        ? rawMessage.map((item) => String(item)).join('; ')
        : String(rawMessage),
    };
  }
}
