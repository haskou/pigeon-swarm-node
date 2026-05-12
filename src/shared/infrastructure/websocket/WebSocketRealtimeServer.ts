import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer } from 'ws';

import { WebSocketConnectionAuthenticator } from './WebSocketConnectionAuthenticator';
import { webSocketEventHub } from './WebSocketEventHub';

export class WebSocketRealtimeServer {
  private readonly authenticator = new WebSocketConnectionAuthenticator();
  private readonly server = new WebSocketServer({ noServer: true });

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
