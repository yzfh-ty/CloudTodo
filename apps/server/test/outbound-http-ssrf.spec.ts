import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { OutboundHttpService } from '../src/common/security/outbound-http.service';

function buildService(env: Record<string, string> = {}) {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new OutboundHttpService(configService);
}

describe('outbound webhook SSRF protections', () => {
  it.each([
    ['loopback IPv4', 'https://127.0.0.1/hook'],
    ['loopback IPv6', 'https://[::1]/hook'],
    ['private 10.x', 'https://10.1.2.3/hook'],
    ['private 172.16.x', 'https://172.16.0.1/hook'],
    ['private 192.168.x', 'https://192.168.1.1/hook'],
    ['link-local / cloud metadata', 'https://169.254.169.254/hook'],
    ['unspecified', 'https://0.0.0.0/hook'],
    ['IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]/hook'],
    ['IPv6 unique local', 'https://[fd00::1]/hook'],
  ])('blocks %s targets', async (_label, url) => {
    await expect(buildService().validateUrl(url)).rejects.toMatchObject({
      response: { code: 'WEBHOOK_URL_HOST_BLOCKED' },
    });
  });

  it('allows a public unicast IP target', async () => {
    const validated = await buildService().validateUrl('https://93.184.216.34/hook');
    expect(validated.addresses).toEqual(['93.184.216.34']);
  });

  it('rejects plain http URLs by default', async () => {
    await expect(buildService().validateUrl('http://example.com/hook')).rejects.toMatchObject({
      response: { code: 'WEBHOOK_URL_INVALID' },
    });
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(
      buildService().validateUrl('https://user:pass@example.com/hook'),
    ).rejects.toMatchObject({
      response: { code: 'WEBHOOK_URL_INVALID' },
    });
  });

  it('rejects ports outside the whitelist and a wildcard whitelist', async () => {
    await expect(
      buildService().validateUrl('https://93.184.216.34:8443/hook'),
    ).rejects.toMatchObject({
      response: { code: 'WEBHOOK_URL_PORT_BLOCKED' },
    });
    await expect(
      buildService({ WEBHOOK_ALLOWED_PORTS: '*' }).validateUrl('https://93.184.216.34/hook'),
    ).rejects.toMatchObject({
      response: { code: 'WEBHOOK_URL_PORT_BLOCKED' },
    });
  });

  it('allows private targets only with the development escape hatch', async () => {
    const service = buildService({
      WEBHOOK_ALLOW_PRIVATE_NETWORKS: 'true',
      WEBHOOK_ALLOWED_PORTS: '80,443',
    });
    const validated = await service.validateUrl('http://127.0.0.1/hook');
    expect(validated.addresses).toEqual(['127.0.0.1']);
  });
});

describe('outbound webhook redirect handling', () => {
  let server: Server;
  let port: number;
  let redirectTargetHits = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.statusCode = 302;
        res.setHeader('Location', `http://127.0.0.1:${port}/target`);
        res.end('moved');
        return;
      }
      redirectTargetHits += 1;
      res.statusCode = 200;
      res.end('target reached');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('does not follow redirects and treats 3xx as a failed delivery', async () => {
    const service = buildService({
      WEBHOOK_ALLOW_PRIVATE_NETWORKS: 'true',
      WEBHOOK_ALLOWED_PORTS: `80,443,${port}`,
    });

    const response = await service.postJson(
      `http://127.0.0.1:${port}/redirect`,
      { 'Content-Type': 'application/json' },
      '{}',
    );

    expect(response.status).toBe(302);
    expect(response.ok).toBe(false);
    expect(redirectTargetHits).toBe(0);
  });
});
