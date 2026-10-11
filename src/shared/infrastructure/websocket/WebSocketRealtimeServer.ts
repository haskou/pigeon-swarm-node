import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer } from 'ws';

import { REALTIME_PROTOCOL_VERSION } from './RealtimeTicketStore';
import { WebSocketAdmissionLimiter } from './WebSocketAdmissionLimiter';
import { webSocketEventHub } from './WebSocketEventHub';
import { WebSocketOriginPolicy } from './WebSocketOriginPolicy';
import { WebSocketTicketAuthenticator } from './WebSocketTicketAuthenticator';

const MAX_CLIENT_FRAME_BYTES = 16 * 1024;

export class WebSocketRealtimeServer {
  private readonly admissionLimiter = new WebSocketAdmissionLimiter();
  private readonly ticketAuthenticator = new WebSocketTicketAuthenticator();
  private readonly originPolicy = new WebSocketOriginPolicy();
  private readonly server = new WebSocketServer({
    handleProtocols: () => REALTIME_PROTOCOL_VERSION,
    maxPayload: MAX_CLIENT_FRAME_BYTES,
    noServer: true,
  });

  private handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    ticketPath: string,
  ): void {
    const url = new URL(request.url || '/', 'http://localhost');

    if (url.pathname !== ticketPath) {
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
      const identityId = this.ticketAuthenticator.authenticate(request);

      this.server.handleUpgrade(request, socket, head, (client) => {
        webSocketEventHub.register(identityId, client);
        this.server.emit('connection', client, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  public attach(httpServer: HttpServer, ticketPath: string): void {
    httpServer.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head, ticketPath);
    });
  }
}
