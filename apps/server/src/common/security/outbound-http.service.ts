import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resolver } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import ipaddr = require('ipaddr.js');

export interface OutboundHttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

export interface ValidatedUrl {
  url: URL;
  hostname: string;
  addresses: string[];
}

class OutboundHttpDeadlineExceededError extends Error {
  constructor() {
    super('webhook request deadline exceeded');
    this.name = 'OutboundHttpDeadlineExceededError';
  }
}

@Injectable()
export class OutboundHttpService {
  constructor(private readonly configService: ConfigService) {}

  async postJson(
    rawUrl: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<OutboundHttpResponse> {
    const requestMaxBytes = this.getPositiveNumber('WEBHOOK_REQUEST_MAX_BYTES', 256 * 1024);
    const bodyBytes = Buffer.byteLength(body, 'utf8');
    if (bodyBytes > requestMaxBytes) {
      throw new BadRequestException({
        code: 'WEBHOOK_REQUEST_TOO_LARGE',
        message: 'webhook request body exceeds the configured size limit',
      });
    }

    const timeoutMs = this.getPositiveNumber('WEBHOOK_REQUEST_TIMEOUT_MS', 5000);
    const deadlineAt = Date.now() + timeoutMs;
    const validated = await this.validateUrlBefore(rawUrl, deadlineAt);
    const maxBytes = this.getPositiveNumber('WEBHOOK_RESPONSE_MAX_BYTES', 2000);
    return this.sendPostRequest(
      validated,
      headers,
      body,
      this.remainingTimeMs(deadlineAt),
      maxBytes,
    );
  }

  async validateUrl(rawUrl: string): Promise<ValidatedUrl> {
    const timeoutMs = this.getPositiveNumber('WEBHOOK_REQUEST_TIMEOUT_MS', 5000);
    try {
      return await this.validateUrlBefore(rawUrl, Date.now() + timeoutMs);
    } catch (error) {
      if (error instanceof OutboundHttpDeadlineExceededError) {
        throw new BadRequestException({
          code: 'WEBHOOK_URL_HOST_INVALID',
          message: 'webhook url host could not be resolved',
        });
      }
      throw error;
    }
  }

  private async validateUrlBefore(
    rawUrl: string,
    deadlineAt: number,
  ): Promise<ValidatedUrl> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_INVALID',
        message: 'webhook url must be a valid absolute URL',
      });
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_INVALID',
        message: 'webhook url must use https',
      });
    }

    if (url.username || url.password) {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_INVALID',
        message: 'webhook url must not contain credentials',
      });
    }

    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!this.isAllowedPort(port)) {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_PORT_BLOCKED',
        message: 'webhook url port is not allowed',
      });
    }

    const addresses = await this.resolvePublicAddresses(url.hostname, deadlineAt);
    return { url, hostname: url.hostname, addresses };
  }

  private async resolvePublicAddresses(hostname: string, deadlineAt: number) {
    const normalized = hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    const directIpVersion = isIP(normalized);
    let lookupResults: { address: string }[];
    try {
      lookupResults = directIpVersion
        ? [{ address: normalized }]
        : await this.lookupBeforeDeadline(normalized, deadlineAt);
    } catch (error) {
      if (error instanceof OutboundHttpDeadlineExceededError) {
        throw error;
      }
      throw new BadRequestException({
        code: 'WEBHOOK_URL_HOST_INVALID',
        message: 'webhook url host could not be resolved',
      });
    }

    if (lookupResults.length === 0) {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_HOST_INVALID',
        message: 'webhook url host could not be resolved',
      });
    }

    const addresses = lookupResults.map((item) => item.address);
    for (const address of addresses) {
      if (this.isBlockedIp(address)) {
        throw new BadRequestException({
          code: 'WEBHOOK_URL_HOST_BLOCKED',
          message: 'webhook url host resolves to a private or reserved address',
        });
      }
    }

    return addresses;
  }

  private async lookupBeforeDeadline(hostname: string, deadlineAt: number) {
    const remainingMs = this.remainingTimeMs(deadlineAt);
    const resolver = this.createResolver();
    let deadlineTimer: NodeJS.Timeout | undefined;

    try {
      const results = await Promise.race([
        Promise.allSettled([
          resolver.resolve4(hostname),
          resolver.resolve6(hostname),
        ]),
        new Promise<never>((_resolve, reject) => {
          deadlineTimer = setTimeout(() => {
            reject(new OutboundHttpDeadlineExceededError());
            resolver.cancel();
          }, remainingMs);
        }),
      ]);
      const addresses = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      );
      if (addresses.length === 0) {
        const failure = results.find((result) => result.status === 'rejected');
        throw failure?.reason ?? new Error('webhook hostname has no addresses');
      }
      return [...new Set(addresses)].map((address) => ({ address }));
    } finally {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
      }
    }
  }

  private createResolver() {
    return new Resolver();
  }

  private isAllowedPort(port: number) {
    const configured =
      this.configService.get<string>('WEBHOOK_ALLOWED_PORTS') ??
      '443';
    if (configured.trim() === '*') {
      return false;
    }

    const allowedPorts = configured
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);

    return allowedPorts.includes(port);
  }

  private isBlockedIp(address: string) {
    let parsed: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      parsed = ipaddr.parse(address);
    } catch {
      return true;
    }

    if (this.isIpv6Address(parsed) && parsed.isIPv4MappedAddress()) {
      return this.isBlockedAddress(parsed.toIPv4Address());
    }

    return this.isBlockedAddress(parsed);
  }

  private isBlockedAddress(address: ipaddr.IPv4 | ipaddr.IPv6) {
    return address.range() !== 'unicast';
  }

  private isIpv6Address(address: ipaddr.IPv4 | ipaddr.IPv6): address is ipaddr.IPv6 {
    return address.kind() === 'ipv6';
  }

  private sendPostRequest(
    validated: ValidatedUrl,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
    maxBytes: number,
  ) {
    const client = validated.url.protocol === 'https:' ? https : http;
    const bodyBuffer = Buffer.from(body, 'utf8');
    let lookupIndex = 0;

    return new Promise<OutboundHttpResponse>((resolve, reject) => {
      let settled = false;
      let request: http.ClientRequest | undefined;
      let deadlineTimer: NodeJS.Timeout | undefined;
      const settle = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        if (deadlineTimer) {
          clearTimeout(deadlineTimer);
        }
        request?.destroy();
        fn();
      };

      request = client.request(
        validated.url,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': String(bodyBuffer.byteLength),
          },
          timeout: timeoutMs,
          lookup: (_hostname, _options, callback) => {
            const address = validated.addresses[lookupIndex % validated.addresses.length];
            lookupIndex += 1;
            callback(null, address, isIP(address));
          },
          servername: validated.hostname,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;

          response.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxBytes) {
              response.destroy(new Error('webhook response body exceeded size limit'));
              return;
            }

            chunks.push(chunk);
          });

          response.on('end', () => {
            settle(() => {
              resolve({
                status: response.statusCode ?? 0,
                ok: Boolean(
                  response.statusCode &&
                    response.statusCode >= 200 &&
                    response.statusCode < 300,
                ),
                body: Buffer.concat(chunks).toString('utf8'),
              });
            });
          });

          response.on('error', (error) => {
            settle(() => reject(error));
          });
        },
      );

      request.on('timeout', () => {
        settle(() => reject(new Error('webhook request timed out')));
      });
      request.on('error', (error) => {
        settle(() => reject(error));
      });

      deadlineTimer = setTimeout(() => {
        settle(() => reject(new Error('webhook request deadline exceeded')));
      }, timeoutMs);

      request.end(bodyBuffer);
    });
  }

  private getPositiveNumber(key: string, fallback: number) {
    const configured = Number(this.configService.get<string>(key));
    return Number.isFinite(configured) && configured > 0 ? configured : fallback;
  }

  private remainingTimeMs(deadlineAt: number) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new OutboundHttpDeadlineExceededError();
    }
    return remainingMs;
  }

}
