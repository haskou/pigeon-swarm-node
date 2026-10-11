import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer } from 'ws';

import { REALTIME_PROTOCOL_VERSION } from './RealtimeTicketStore';
import { WebSocketAdmissionLimiter } from './WebSocketAdmissionLimiter';
import { WebSocketConnectionAuthenticator } from './WebSocketConnectionAuthenticator';
import { webSocketEventHub } from './WebSocketEventHub';
import { WebSocketOriginPolicy } from './WebSocketOriginPolicy';
import { WebSocketTicketAuthenticator } from './WebSocketTicketAuthenticator';

const MAX_CLIENT_FRAME_BYTES = 16 * 1024;

export type WebSocketPaths = {
  /**
   * Legacy endpoint: credentials as signed query parameters or headers.
   * Omit it to refuse the endpoint.
   */
  signedQueryPath?: string;
  /** Credentialless endpoint: single-use ticket in Sec-WebSocket-Protocol. */
  ticketPath: string;
};

export class WebSocketRealtimeServer {
  private readonly admissionLimiter = new WebSocketAdmissionLimiter();
  private readonly authenticator = new WebSocketConnectionAuthenticator();
  private readonly ticketAuthenticator = new WebSocketTicketAuthenticator();
  private readonly originPolicy = new WebSocketOriginPolicy();
  private ticketPath = '';
  private readonly server = new WebSocketServer({
    handleProtocols: (protocols: Set<string>, request: IncomingMessage) => {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;

      // Only ticket upgrades echo the version subprotocol. Legacy upgrades keep ws's default selection, so behavior is unchanged.
      if (pathname === this.ticketPath) {
        return REALTIME_PROTOCOL_VERSION;
      }

      const [protocol] = protocols;

      return protocol ?? false;
    },
    maxPayload: MAX_CLIENT_FRAME_BYTES,
    noServer: true,
  });

  private handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    paths: WebSocketPaths,
  ): void {
    const url = new URL(request.url || '/', 'http://localhost');
    const authenticators = new Map([
      [paths.ticketPath, () => this.ticketAuthenticator.authenticate(request)],
    ]);

    if (paths.signedQueryPath !== undefined) {
      const signedQueryPath = paths.signedQueryPath;

      authenticators.set(signedQueryPath, () =>
        this.authenticator.authenticate(request, signedQueryPath),
      );
    }

    const authenticate = authenticators.get(url.pathname);

    if (!authenticate) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();

      return;
    }

    if (!this.originPolicy.allows(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();

      return;
    }

    if (
      !this.admissionLimiter.admit(
        request.socket.remoteAddress || 'unknown',
        webSocketEventHub.getOpenSocketCount(),
      )
    ) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();

      return;
    }

    try {
      const identityId = authenticate();

      this.server.handleUpgrade(request, socket, head, (client) => {
        webSocketEventHub.register(identityId, client);
        this.server.emit('connection', client, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  public attach(httpServer: HttpServer, paths: WebSocketPaths): void {
    this.ticketPath = paths.ticketPath;
    httpServer.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head, paths);
    });
  }
}
