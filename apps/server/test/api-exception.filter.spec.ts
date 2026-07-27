import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter } from '../src/common/http/api-exception.filter';

function buildHost(headersSent = false) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, headersSent }),
      getRequest: () => ({ method: 'GET', url: '/api/todos/not-a-uuid' }),
    }),
  };
  return { host, status, json };
}

function knownRequestError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db said no', {
    code,
    clientVersion: 'test',
  });
}

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;

  beforeEach(() => {
    filter = new ApiExceptionFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('passes through an application error unchanged', () => {
    const { host, status, json } = buildHost();
    filter.catch(
      new ForbiddenException({ code: 'MFA_CONFIRMATION_REQUIRED', message: 'need a code' }),
      host as never,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      code: 'MFA_CONFIRMATION_REQUIRED',
      message: 'need a code',
    });
  });

  it('normalizes a framework error that carries no contract code', () => {
    // ValidationPipe and ParseUUIDPipe answer with {statusCode, message, error},
    // which the clients cannot read: they expect {code, message}.
    const { host, status, json } = buildHost();
    filter.catch(
      new BadRequestException(['title must be a string', 'title should not be empty']),
      host as never,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'title must be a string; title should not be empty',
    });
  });

  it('normalizes a plain-string HttpException', () => {
    const { host, json } = buildHost();
    filter.catch(new NotFoundException('nothing here'), host as never);
    expect(json).toHaveBeenCalledWith({ code: 'NOT_FOUND', message: 'nothing here' });
  });

  it('maps a malformed UUID (Prisma P2023) to 400 instead of 500', () => {
    const { host, status, json } = buildHost();
    filter.catch(knownRequestError('P2023'), host as never);
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'invalid request parameter',
    });
  });

  it('maps a missing record (P2025) to 404', () => {
    const { host, status, json } = buildHost();
    filter.catch(knownRequestError('P2025'), host as never);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      code: 'NOT_FOUND',
      message: 'resource not found',
    });
  });

  it('maps a unique constraint violation (P2002) to 409', () => {
    const { host, status, json } = buildHost();
    filter.catch(knownRequestError('P2002'), host as never);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      code: 'CONFLICT',
      message: 'resource already exists',
    });
  });

  it('never leaks database detail for an unmapped Prisma error', () => {
    const { host, status, json } = buildHost();
    filter.catch(knownRequestError('P2030'), host as never);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'internal server error',
    });
  });

  it('never leaks the message of an unexpected error', () => {
    const { host, status, json } = buildHost();
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host as never);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'internal server error',
    });
  });

  it('does not write a second response once headers are sent', () => {
    // The admin panel guard redirects and then returns false, which Nest turns
    // into a ForbiddenException after the 302 is already on the wire.
    const { host, status } = buildHost(true);
    expect(() => filter.catch(new ForbiddenException(), host as never)).not.toThrow();
    expect(status).not.toHaveBeenCalled();
  });

  it('keeps a non-standard HttpException status', () => {
    const { host, status } = buildHost();
    filter.catch(
      new HttpException({ code: 'RATE_LIMITED', message: 'slow down' }, 429),
      host as never,
    );
    expect(status).toHaveBeenCalledWith(429);
  });
});
