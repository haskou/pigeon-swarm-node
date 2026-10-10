import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer } from 'ws';

import { WebSocketAdmissionLimiter } from './WebSocketAdmissionLimiter';
import { WebSocketConnectionAuthenticator } from './WebSocketConnectionAuthenticator';
import { webSocketEventHub } from './WebSocketEventHub';
import { WebSocketOriginPolicy } from './WebSocketOriginPolicy';

const MAX_CLIENT_FRAME_BYTES = 16 * 1024;

export class WebSocketRealtimeServer {
  private readonly admissionLimiter = new WebSocketAdmissionLimiter();
  private readonly authenticator = new WebSocketConnectionAuthenticator();
  private readonly originPolicy = new WebSocketOriginPolicy();
  private readonly server = new WebSocketServer({
    maxPayload: MAX_CLIENT_FRAME_BYTES,
    noServer: true,
  });

  private handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    websocketPath: string,
  ): void {
    const url = new URL(request.url || '/', 'http://localhost');

    if (url.pathname !== websocketPath) {
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
      const identityId = this.authenticator.authenticate(
        request,
        websocketPath,
      );

      this.server.handleUpgrade(request, socket, head, (client) => {
        webSocketEventHub.register(identityId, client);
        this.server.emit('connection', client, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  public attach(httpServer: HttpServer, websocketPath: string): void {
    httpServer.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head, websocketPath);
    });
  }
}
