import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
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

@Injectable()
export class OutboundHttpService {
  constructor(private readonly configService: ConfigService) {}

  async postJson(
    rawUrl: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<OutboundHttpResponse> {
    const validated = await this.validateUrl(rawUrl);
    const timeoutMs = this.getPositiveNumber('WEBHOOK_REQUEST_TIMEOUT_MS', 5000);
    const maxBytes = this.getPositiveNumber('WEBHOOK_RESPONSE_MAX_BYTES', 2000);
    return this.sendPostRequest(validated, headers, body, timeoutMs, maxBytes);
  }

  async validateUrl(rawUrl: string): Promise<ValidatedUrl> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_INVALID',
        message: 'webhook url must be a valid absolute URL',
      });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_INVALID',
        message: 'webhook url must use http or https',
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

    const addresses = await this.resolvePublicAddresses(url.hostname);
    return { url, hostname: url.hostname, addresses };
  }

  private async resolvePublicAddresses(hostname: string) {
    const normalized = hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    const directIpVersion = isIP(normalized);
    let lookupResults: { address: string }[];
    try {
      lookupResults = directIpVersion
        ? [{ address: normalized }]
        : await lookup(normalized, { all: true, verbatim: true });
    } catch {
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

  private isAllowedPort(port: number) {
    const configured =
      this.configService.get<string>('WEBHOOK_ALLOWED_PORTS') ??
      (this.allowPrivateNetworkTargets() ? '*' : '80,443');
    if (configured.trim() === '*') {
      return true;
    }

    const allowedPorts = configured
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);

    return allowedPorts.includes(port);
  }

  private isBlockedIp(address: string) {
    if (this.allowPrivateNetworkTargets()) {
      return false;
    }

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
      const settle = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      const request = client.request(
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
        request.destroy(new Error('webhook request timed out'));
      });
      request.on('error', (error) => {
        settle(() => reject(error));
      });
      request.end(bodyBuffer);
    });
  }

  private getPositiveNumber(key: string, fallback: number) {
    const configured = Number(this.configService.get<string>(key));
    return Number.isFinite(configured) && configured > 0 ? configured : fallback;
  }

  private allowPrivateNetworkTargets() {
    return this.configService.get<string>('WEBHOOK_ALLOW_PRIVATE_NETWORKS') === 'true';
  }
}
