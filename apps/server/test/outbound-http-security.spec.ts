import { ConfigService } from '@nestjs/config';
import {
  OutboundHttpResponse,
  OutboundHttpService,
  ValidatedUrl,
} from '../src/common/security/outbound-http.service';

interface OutboundHttpTestApi {
  createResolver(): {
    resolve4(hostname: string): Promise<string[]>;
    resolve6(hostname: string): Promise<string[]>;
    cancel(): void;
  };
  sendPostRequest(
    validated: ValidatedUrl,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
    maxBytes: number,
  ): Promise<OutboundHttpResponse>;
}

describe('outbound webhook request deadline', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stops waiting for DNS at the total request deadline without opening a connection', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    const service = new OutboundHttpService(
      new ConfigService({ WEBHOOK_REQUEST_TIMEOUT_MS: '1000' }),
    );
    const cancel = jest.fn();
    jest.spyOn(
      service as unknown as OutboundHttpTestApi,
      'createResolver',
    ).mockReturnValue({
      resolve4: () => new Promise(() => undefined),
      resolve6: () => new Promise(() => undefined),
      cancel,
    });
    const sendPostRequest = jest.spyOn(
      service as unknown as OutboundHttpTestApi,
      'sendPostRequest',
    );
    const result = service
      .postJson('https://hooks.example.com/events', {}, '{}')
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    await jest.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toMatchObject({
      message: 'webhook request deadline exceeded',
    });
    expect(sendPostRequest).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('uses only the request budget left after DNS resolution', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    const service = new OutboundHttpService(
      new ConfigService({
        WEBHOOK_REQUEST_TIMEOUT_MS: '1000',
        WEBHOOK_RESPONSE_MAX_BYTES: '2000',
      }),
    );
    jest.spyOn(
      service as unknown as OutboundHttpTestApi,
      'createResolver',
    ).mockReturnValue({
      resolve4: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(['8.8.8.8']), 600);
        }),
      resolve6: async () => [],
      cancel: jest.fn(),
    });
    const sendPostRequest = jest
      .spyOn(service as unknown as OutboundHttpTestApi, 'sendPostRequest')
      .mockResolvedValue({ status: 204, ok: true, body: '' });
    const request = service.postJson('https://hooks.example.com/events', {}, '{}');

    await jest.advanceTimersByTimeAsync(600);

    await expect(request).resolves.toMatchObject({ status: 204, ok: true });
    expect(sendPostRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'hooks.example.com',
        addresses: ['8.8.8.8'],
      }),
      {},
      '{}',
      400,
      2000,
    );
  });
});
