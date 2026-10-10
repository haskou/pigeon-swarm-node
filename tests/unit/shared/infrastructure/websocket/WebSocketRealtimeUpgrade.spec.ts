import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { WebSocketRealtimeServer } from '@app/shared/infrastructure/websocket/WebSocketRealtimeServer';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';

type Outcome = { status: number } | { opened: true };

describe('realtime upgrade (real HTTP server and ws client)', () => {
  const path = '/ws';
  let server: Server;
  let port: number;

  beforeEach(async () => {
    server = createServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader('Location', 'http://127.0.0.1:1/elsewhere');
      response.end();
    });
    new WebSocketRealtimeServer().attach(server, path);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    delete process.env.REALTIME_ALLOWED_ORIGINS;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  async function signedQuery(): Promise<string> {
    const keyPair = await KeyPair.generate();
    const timestamp = String(Date.now());
    const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
      'GET',
      path,
      timestamp,
      {},
    );
    const query = new URLSearchParams({
      identityId: keyPair.toPrimitives().publicKey,
      signature: keyPair.sign(JSON.stringify(payload)).valueOf(),
      timestamp,
    });

    return `?${query.toString()}`;
  }

  function connect(
    query: string,
    headers: Record<string, string> = {},
  ): Promise<Outcome> {
    return new Promise((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}${path}${query}`, {
        headers,
      });

      socket.on('open', () => {
        socket.terminate();
        resolve({ opened: true });
      });
      socket.on('unexpected-response', (_request, response) => {
        resolve({ status: response.statusCode ?? 0 });
        response.destroy();
      });
      socket.on('error', () => undefined);
    });
  }

  it('does not treat ambient cookies as credentials', async () => {
    expect(
      await connect('', { Cookie: 'session=abc; identityId=victim' }),
    ).toEqual({ status: 401 });
  });

  it('accepts a signed upgrade even when a cookie rides along, ignoring it', async () => {
    expect(
      await connect(await signedQuery(), { Cookie: 'session=abc' }),
    ).toEqual({ opened: true });
  });

  it('never answers an upgrade with a redirect', async () => {
    const outcomes = await Promise.all([
      connect(''),
      connect('?identityId=x&timestamp=1&signature=y'),
    ]);

    for (const outcome of outcomes) {
      expect(outcome).toEqual({ status: 401 });
    }
  });

  it('refuses browser origins outside the allowlist with 403', async () => {
    process.env.REALTIME_ALLOWED_ORIGINS =
      'https://chat.example.com, https://alt.example.com';

    expect(
      await connect(await signedQuery(), { Origin: 'https://evil.example' }),
    ).toEqual({ status: 403 });
    expect(await connect(await signedQuery(), { Origin: 'null' })).toEqual({
      status: 403,
    });
    expect(
      await connect(await signedQuery(), {
        Origin: 'https://CHAT.example.com',
      }),
    ).toEqual({ opened: true });
  });

  it('leaves clients without an Origin to signature authentication', async () => {
    process.env.REALTIME_ALLOWED_ORIGINS = 'https://chat.example.com';

    expect(await connect(await signedQuery())).toEqual({ opened: true });
    expect(await connect('')).toEqual({ status: 401 });
  });

  it('does not restrict origins when the allowlist is unset', async () => {
    expect(
      await connect(await signedQuery(), {
        Origin: 'https://anything.example',
      }),
    ).toEqual({ opened: true });
  });
});
