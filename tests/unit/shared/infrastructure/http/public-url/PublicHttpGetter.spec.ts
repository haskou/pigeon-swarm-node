import { PublicHttpFetchError } from '@app/shared/infrastructure/http/public-url/PublicHttpFetchError';
import { PublicHttpGetOptions } from '@app/shared/infrastructure/http/public-url/PublicHttpGetOptions';
import PublicHttpGetter from '@app/shared/infrastructure/http/public-url/PublicHttpGetter';
import { PublicHttpResponseTooLargeError } from '@app/shared/infrastructure/http/public-url/PublicHttpResponseTooLargeError';
import PublicUrlGuard from '@app/shared/infrastructure/http/public-url/PublicUrlGuard';
import { UrlIsNotPublicError } from '@app/shared/infrastructure/http/public-url/UrlIsNotPublicError';
import http from 'http';
import { mock, MockProxy } from 'jest-mock-extended';
import { AddressInfo } from 'net';

/**
 * The guard is mocked to vouch for a loopback test server, standing in for a
 * public host; the getter must still only ever dial the address it was given.
 */
describe('PublicHttpGetter', () => {
  let server: http.Server;
  let handler: http.RequestListener;
  let port: number;
  let guard: MockProxy<PublicUrlGuard>;
  let getter: PublicHttpGetter;

  const options = (
    overrides: Partial<PublicHttpGetOptions> = {},
  ): PublicHttpGetOptions => ({
    accept: 'application/json',
    expectedContentType: 'application/json',
    maxBytes: 1024,
    timeoutMs: 2000,
    userAgent: 'test',
    ...overrides,
  });

  const url = (): URL => new URL(`http://public.example:${port}/doc`);

  beforeAll(async () => {
    server = http.createServer((request, response) =>
      handler(request, response),
    );
    const listening = Promise.withResolvers<void>();

    server.listen(0, '127.0.0.1', listening.resolve);
    await listening.promise;
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    const closed = Promise.withResolvers<void>();

    server.close(() => closed.resolve());
    await closed.promise;
  });

  beforeEach(() => {
    guard = mock<PublicUrlGuard>();
    guard.resolve.mockImplementation(async (target) => ({
      addresses: [{ address: '127.0.0.1', family: 4 }],
      url: new URL(target.toString()),
    }));
    getter = new PublicHttpGetter(guard);
  });

  it('should read a body within the limit and its headers from the checked address', async () => {
    handler = (_request, response): void => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('X-Identity-Signature', 'c2lnbmVk');
      response.end('{"ok":true}');
    };

    const result = await getter.get(url(), options());

    expect(result.statusCode).toBe(200);
    expect(result.body.toString()).toBe('{"ok":true}');
    expect(result.headers['x-identity-signature']).toBe('c2lnbmVk');
    expect(guard.resolve).toHaveBeenCalledWith(url());
  });

  it('should fall back to the next checked address when one does not connect', async () => {
    handler = (_request, response): void => {
      response.setHeader('content-type', 'application/json');
      response.end('{"ok":true}');
    };
    guard.resolve.mockImplementation(async (target) => ({
      addresses: [
        { address: '::1', family: 6 },
        { address: '127.0.0.1', family: 4 },
      ],
      url: new URL(target.toString()),
    }));

    const result = await getter.get(url(), options());

    expect(result.body.toString()).toBe('{"ok":true}');
  });

  it('should fail when none of the checked addresses connects', async () => {
    guard.resolve.mockImplementation(async (target) => ({
      addresses: [{ address: '::1', family: 6 }],
      url: new URL(target.toString()),
    }));

    await expect(getter.get(url(), options())).rejects.toThrow(
      PublicHttpFetchError,
    );
  });

  it('should abort a streamed body as soon as it passes the limit', async () => {
    let written = 0;
    let closed = false;

    handler = (request, response): void => {
      response.setHeader('content-type', 'application/json');
      const chunk = Buffer.alloc(512, 'a');
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);

          return;
        }

        written += chunk.length;
        response.write(chunk);
      }, 5);

      request.socket.on('close', () => {
        closed = true;
      });
    };

    await expect(getter.get(url(), options())).rejects.toThrow(
      PublicHttpResponseTooLargeError,
    );
    const settled = Promise.withResolvers<void>();

    setTimeout(settled.resolve, 100);
    await settled.promise;

    expect(closed).toBe(true);
    expect(written).toBeLessThan(1024 * 64);
  });

  it('should refuse a declared length above the limit before reading', async () => {
    handler = (_request, response): void => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('content-length', '4096');
      response.end(Buffer.alloc(4096, 'a'));
    };

    await expect(getter.get(url(), options())).rejects.toThrow(
      PublicHttpResponseTooLargeError,
    );
  });

  it('should return a redirect without following it', async () => {
    let requests = 0;

    handler = (_request, response): void => {
      requests += 1;
      response.statusCode = 302;
      response.setHeader('location', 'http://169.254.169.254/latest');
      response.end();
    };

    const result = await getter.get(url(), options());

    expect(result.statusCode).toBe(302);
    expect(result.redirectLocation?.toString()).toBe(
      'http://169.254.169.254/latest',
    );
    expect(result.body.length).toBe(0);
    expect(requests).toBe(1);
    expect(guard.resolve).toHaveBeenCalledTimes(1);
  });

  it('should give up when the whole exchange outlasts the timeout', async () => {
    handler = (_request, response): void => {
      response.setHeader('content-type', 'application/json');
      response.write('{');
    };

    await expect(
      getter.get(url(), options({ timeoutMs: 200 })),
    ).rejects.toThrow(PublicHttpFetchError);
  });

  it('should refuse an unexpected content type without reading', async () => {
    handler = (_request, response): void => {
      response.setHeader('content-type', 'text/html');
      response.end('<html></html>');
    };

    await expect(getter.get(url(), options())).rejects.toThrow(
      PublicHttpFetchError,
    );
  });

  it('should not connect when the guard refuses the URL', async () => {
    let requests = 0;

    handler = (_request, response): void => {
      requests += 1;
      response.end();
    };
    guard.resolve.mockRejectedValue(
      new UrlIsNotPublicError('Private IP addresses are not allowed.'),
    );

    await expect(getter.get(url(), options())).rejects.toThrow(
      UrlIsNotPublicError,
    );
    expect(requests).toBe(0);
  });
});
