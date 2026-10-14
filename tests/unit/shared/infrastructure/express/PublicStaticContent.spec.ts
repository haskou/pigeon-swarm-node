import { RoutePrefix } from '@haskou/ddd-kernel/adapters/ui';
import { PublicStaticContent } from '@app/shared/infrastructure/express/PublicStaticContent';
import express from 'express';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import path from 'path';

describe('PublicStaticContent', () => {
  const originalDirectory = process.cwd();
  let directory: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'pigeon-public-'));
    await mkdir(path.join(directory, 'public', 'assets'), { recursive: true });
    await writeFile(
      path.join(directory, 'public', 'index.html'),
      '<!doctype html><title>Pigeon</title>',
    );
    await writeFile(
      path.join(directory, 'public', 'assets', 'app.js'),
      'export {};',
    );
    process.chdir(directory);

    const app = express();
    app.get('/api/ping', (_request, response) => {
      response.json({ ok: true });
    });
    new PublicStaticContent(new RoutePrefix('/api')).register(app);
    process.chdir(originalDirectory);

    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    process.chdir(originalDirectory);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(directory, { force: true, recursive: true });
  });

  it.each(['/', '/index.html', '/conversations/abc', '/assets/app.js'])(
    'forbids framing and MIME sniffing of the client at %s',
    async (requestPath) => {
      const response = await fetch(`${baseUrl}${requestPath}`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-security-policy')).toBe(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('permissions-policy')).toBe(
        'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
      );
    },
  );

  it('leaves the API routes under the prefix to their own headers', async () => {
    const response = await fetch(`${baseUrl}/api/ping`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('x-frame-options')).toBeNull();
  });
});
