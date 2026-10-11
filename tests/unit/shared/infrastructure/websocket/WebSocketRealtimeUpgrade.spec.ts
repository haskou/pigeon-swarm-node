import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  REALTIME_PROTOCOL_VERSION,
  RealtimeTicketStore,
  realtimeTicketStore,
} from '@app/shared/infrastructure/websocket/RealtimeTicketStore';
import { WebSocketRealtimeServer } from '@app/shared/infrastructure/websocket/WebSocketRealtimeServer';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';

type Outcome = { status: number } | { opened: true };
type ProtocolOutcome = { status: number } | { opened: true; protocol: string };

describe('realtime upgrade (real HTTP server and ws client)', () => {
  const path = '/ws';
  const ticketPath = '/realtime/v1';
  let server: Server;
  let port: number;

  beforeEach(async () => {
    server = createServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader('Location', 'http://127.0.0.1:1/elsewhere');
      response.end();
    });
    new WebSocketRealtimeServer().attach(server, {
      signedQueryPath: path,
      ticketPath,
    });
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

  describe('credentialless ticket upgrade', () => {
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

    function connectWithProtocols(
      target: string,
      protocols: string[],
    ): Promise<ProtocolOutcome> {
      const { promise, resolve } = Promise.withResolvers<ProtocolOutcome>();
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}${target}`,
        protocols,
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

    it('opens with the version subprotocol and never echoes the ticket', async () => {
      const ticket = await issueTicket();

      expect(
        await connectWithProtocols(ticketPath, [
          REALTIME_PROTOCOL_VERSION,
          `ticket.${ticket}`,
        ]),
      ).toEqual({ opened: true, protocol: REALTIME_PROTOCOL_VERSION });
    });

    it('consumes the ticket on first use', async () => {
      const ticket = await issueTicket();
      const protocols = [REALTIME_PROTOCOL_VERSION, `ticket.${ticket}`];

      expect(await connectWithProtocols(ticketPath, protocols)).toMatchObject({
        opened: true,
      });
      expect(await connectWithProtocols(ticketPath, protocols)).toEqual({
        status: 401,
      });
    });

    it('refuses a ticket that was never issued', async () => {
      expect(
        await connectWithProtocols(ticketPath, [
          REALTIME_PROTOCOL_VERSION,
          `ticket.${'A'.repeat(43)}`,
        ]),
      ).toEqual({ status: 401 });
    });

    it('refuses a request without the version subprotocol', async () => {
      const ticket = await issueTicket();

      expect(
        await connectWithProtocols(ticketPath, [`ticket.${ticket}`]),
      ).toEqual({ status: 401 });
    });

    it('refuses more than one ticket offered at once', async () => {
      const first = await issueTicket();
      const second = await issueTicket();

      expect(
        await connectWithProtocols(ticketPath, [
          REALTIME_PROTOCOL_VERSION,
          `ticket.${first}`,
          `ticket.${second}`,
        ]),
      ).toEqual({ status: 401 });
    });

    it('refuses a ticket passed in the query string', async () => {
      const ticket = await issueTicket();

      expect(
        await connectWithProtocols(`${ticketPath}?ticket=${ticket}`, [
          REALTIME_PROTOCOL_VERSION,
        ]),
      ).toEqual({ status: 401 });
    });

    it('does not authenticate the signed path with a ticket', async () => {
      const ticket = await issueTicket();

      expect(
        await connectWithProtocols(path, [
          REALTIME_PROTOCOL_VERSION,
          `ticket.${ticket}`,
        ]),
      ).toEqual({ status: 401 });
    });

    it('refuses an expired ticket', async () => {
      const ticket = await issueTicket();
      const spy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + RealtimeTicketStore.TTL_MS + 1);

      try {
        expect(
          await connectWithProtocols(ticketPath, [
            REALTIME_PROTOCOL_VERSION,
            `ticket.${ticket}`,
          ]),
        ).toEqual({ status: 401 });
      } finally {
        spy.mockRestore();
      }
    });
  });
});
