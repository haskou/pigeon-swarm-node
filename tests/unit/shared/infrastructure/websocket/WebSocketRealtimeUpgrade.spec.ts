import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  REALTIME_PROTOCOL_VERSION,
  RealtimeTicketStore,
  realtimeTicketStore,
} from '@app/shared/infrastructure/websocket/RealtimeTicketStore';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { WebSocketRealtimeServer } from '@app/shared/infrastructure/websocket/WebSocketRealtimeServer';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';

type Outcome = { status: number } | { opened: true; protocol: string };

type ConnectOptions = {
  headers?: Record<string, string>;
  protocols?: string[];
};

describe('realtime upgrade (real HTTP server and ws client)', () => {
  const ticketPath = '/realtime';
  const legacyPath = '/ws';
  let server: Server;
  let port: number;
  let realtimeServer: WebSocketRealtimeServer;

  beforeEach(async () => {
    server = createServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader('Location', 'http://127.0.0.1:1/elsewhere');
      response.end();
    });
    realtimeServer = new WebSocketRealtimeServer();
    realtimeServer.attach(server, ticketPath);
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

  async function issueTicket(): Promise<string> {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(
      keyPair.toPrimitives().publicKey,
    ).valueOf();
    const issued = realtimeTicketStore.issue(identityId);

    if (!issued) {
      throw new Error('ticket capacity exhausted in test');
    }

    return issued.ticket;
  }

  function ticketProtocols(ticket: string): string[] {
    return [REALTIME_PROTOCOL_VERSION, `ticket.${ticket}`];
  }

  async function signedCredentials(
    requestPath: string,
  ): Promise<Record<string, string>> {
    const keyPair = await KeyPair.generate();
    const timestamp = String(Date.now());
    const payload = SignedHttpRequestSignature.signingContent({
      body: {},
      method: 'GET',
      path: requestPath,
      timestamp: Number(timestamp),
    });

    return {
      identityId: new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
      signature: keyPair.sign(payload).valueOf(),
      timestamp,
    };
  }

  async function signedQuery(requestPath: string): Promise<string> {
    const query = new URLSearchParams(await signedCredentials(requestPath));

    return `?${query.toString()}`;
  }

  async function signedHeaders(
    requestPath: string,
  ): Promise<Record<string, string>> {
    const credentials = await signedCredentials(requestPath);

    return {
      'X-Identity-Id': credentials.identityId,
      'X-Signature': credentials.signature,
      'X-Timestamp': credentials.timestamp,
    };
  }

  function connect(
    target: string,
    { headers = {}, protocols }: ConnectOptions = {},
  ): Promise<Outcome> {
    const { promise, resolve } = Promise.withResolvers<Outcome>();
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}${target}`,
      protocols ?? [],
      { headers },
    );

    socket.on('open', () => {
      resolve({ opened: true, protocol: socket.protocol });
      socket.terminate();
    });
    socket.on('unexpected-response', (_request, response) => {
      resolve({ status: response.statusCode ?? 0 });
      response.destroy();
    });
    socket.on('error', () => undefined);

    return promise;
  }

  it('refuses a valid ticket of an identity blocked on this node', async () => {
    const keyPair = await KeyPair.generate();
    const identityId = new IdentityId(keyPair.toPrimitives().publicKey);
    const issued = realtimeTicketStore.issue(identityId.valueOf());

    webSocketEventHub.blockIdentities([identityId]);

    try {
      expect(
        await connect(ticketPath, {
          protocols: ticketProtocols(issued?.ticket ?? ''),
        }),
      ).toEqual({ status: 403 });
    } finally {
      webSocketEventHub.blockIdentities([]);
    }
  });

  it('never answers an upgrade with a redirect', async () => {
    expect(await connect(ticketPath)).toEqual({ status: 401 });
    expect(await connect(legacyPath)).toEqual({ status: 404 });
  });

  describe('credentialless ticket upgrade', () => {
    it('opens with the version subprotocol and never echoes the ticket', async () => {
      const ticket = await issueTicket();

      expect(
        await connect(ticketPath, { protocols: ticketProtocols(ticket) }),
      ).toEqual({ opened: true, protocol: REALTIME_PROTOCOL_VERSION });
    });

    it('consumes the ticket on first use', async () => {
      const protocols = ticketProtocols(await issueTicket());

      expect(await connect(ticketPath, { protocols })).toMatchObject({
        opened: true,
      });
      expect(await connect(ticketPath, { protocols })).toEqual({
        status: 401,
      });
    });

    it('refuses a ticket that was never issued', async () => {
      expect(
        await connect(ticketPath, {
          protocols: [REALTIME_PROTOCOL_VERSION, `ticket.${'A'.repeat(43)}`],
        }),
      ).toEqual({ status: 401 });
    });

    it('refuses a request without the version subprotocol', async () => {
      const ticket = await issueTicket();

      expect(
        await connect(ticketPath, { protocols: [`ticket.${ticket}`] }),
      ).toEqual({ status: 401 });
    });

    it('refuses more than one ticket offered at once', async () => {
      const first = await issueTicket();
      const second = await issueTicket();

      expect(
        await connect(ticketPath, {
          protocols: [
            REALTIME_PROTOCOL_VERSION,
            `ticket.${first}`,
            `ticket.${second}`,
          ],
        }),
      ).toEqual({ status: 401 });
    });

    it('refuses a ticket passed in the query string', async () => {
      const ticket = await issueTicket();

      expect(
        await connect(`${ticketPath}?ticket=${ticket}`, {
          protocols: [REALTIME_PROTOCOL_VERSION],
        }),
      ).toEqual({ status: 401 });
    });

    it('refuses a ticket on the legacy path with 404', async () => {
      const ticket = await issueTicket();

      expect(
        await connect(legacyPath, { protocols: ticketProtocols(ticket) }),
      ).toEqual({ status: 404 });
    });

    it('refuses an expired ticket', async () => {
      const ticket = await issueTicket();
      const spy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + RealtimeTicketStore.TTL_MS + 1);

      try {
        expect(
          await connect(ticketPath, {
            protocols: ticketProtocols(ticket),
          }),
        ).toEqual({ status: 401 });
      } finally {
        spy.mockRestore();
      }
    });

    it('ignores a cookie that rides along with a ticket', async () => {
      const ticket = await issueTicket();

      expect(
        await connect(ticketPath, {
          headers: { Cookie: 'session=abc' },
          protocols: ticketProtocols(ticket),
        }),
      ).toMatchObject({ opened: true });
    });
  });

  describe('query, header and cookie credentials are refused', () => {
    it('refuses a validly signed query on the legacy path with 404', async () => {
      expect(
        await connect(`${legacyPath}${await signedQuery(legacyPath)}`),
      ).toEqual({ status: 404 });
    });

    it('refuses a validly signed query on the ticket path with 401', async () => {
      expect(
        await connect(`${ticketPath}${await signedQuery(ticketPath)}`, {
          protocols: [REALTIME_PROTOCOL_VERSION],
        }),
      ).toEqual({ status: 401 });
    });

    it('refuses validly signed headers on the legacy path with 404', async () => {
      expect(
        await connect(legacyPath, {
          headers: await signedHeaders(legacyPath),
        }),
      ).toEqual({ status: 404 });
    });

    it('refuses validly signed headers on the ticket path with 401', async () => {
      expect(
        await connect(ticketPath, {
          headers: await signedHeaders(ticketPath),
          protocols: [REALTIME_PROTOCOL_VERSION],
        }),
      ).toEqual({ status: 401 });
    });

    it('does not treat a cookie as a credential', async () => {
      expect(
        await connect(ticketPath, {
          headers: { Cookie: 'session=abc; identityId=victim' },
        }),
      ).toEqual({ status: 401 });
    });
  });

  describe('browser Origin allowlist', () => {
    it('refuses browser origins outside the allowlist with 403', async () => {
      process.env.REALTIME_ALLOWED_ORIGINS =
        'https://chat.example.com, https://alt.example.com';

      expect(
        await connect(ticketPath, {
          headers: { Origin: 'https://evil.example' },
          protocols: ticketProtocols(await issueTicket()),
        }),
      ).toEqual({ status: 403 });
      expect(
        await connect(ticketPath, {
          headers: { Origin: 'null' },
          protocols: ticketProtocols(await issueTicket()),
        }),
      ).toEqual({ status: 403 });
      expect(
        await connect(ticketPath, {
          headers: { Origin: 'https://CHAT.example.com' },
          protocols: ticketProtocols(await issueTicket()),
        }),
      ).toMatchObject({ opened: true });
    });

    it('leaves clients without an Origin to ticket authentication', async () => {
      process.env.REALTIME_ALLOWED_ORIGINS = 'https://chat.example.com';

      expect(
        await connect(ticketPath, {
          protocols: ticketProtocols(await issueTicket()),
        }),
      ).toMatchObject({ opened: true });
      expect(await connect(ticketPath)).toEqual({ status: 401 });
    });

    it('does not restrict origins when the allowlist is unset', async () => {
      expect(
        await connect(ticketPath, {
          headers: { Origin: 'https://anything.example' },
          protocols: ticketProtocols(await issueTicket()),
        }),
      ).toMatchObject({ opened: true });
    });
  });

  describe('shutdown', () => {
    it('closes open realtime sockets as going away', async () => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}${ticketPath}`,
        ticketProtocols(await issueTicket()),
      );
      const opened = Promise.withResolvers<void>();
      const closed = Promise.withResolvers<number>();

      socket.on('open', () => opened.resolve());
      socket.on('close', (code) => closed.resolve(code));
      await opened.promise;
      await realtimeServer.close();

      expect(await closed.promise).toBe(1001);
    });

    it('refuses new upgrades once closing', async () => {
      await realtimeServer.close();

      expect(
        await connect(ticketPath, {
          protocols: ticketProtocols(await issueTicket()),
        }),
      ).toEqual({ status: 503 });
    });
  });
});
