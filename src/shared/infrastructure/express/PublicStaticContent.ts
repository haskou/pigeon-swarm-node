import { RoutePrefix } from '@haskou/ddd-kernel/adapters/ui';
import * as express from 'express';
import path from 'path';

export class PublicStaticContent {
  // The client's own CSP is a meta tag, where frame-ancestors is ignored, so
  // framing (clickjacking) is refused here.
  private static readonly securityHeaders: Readonly<Record<string, string>> = {
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Permissions-Policy':
      'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };

  private readonly publicPath = path.resolve(process.cwd(), 'public');
  private readonly staticMiddleware = express.static(this.publicPath, {
    setHeaders: (response, filePath) => {
      response.set(PublicStaticContent.securityHeaders);

      if (path.basename(filePath) === 'sw.js') {
        response.setHeader('Cache-Control', 'no-store');
      }
    },
  });

  private readonly indexPath = path.join(this.publicPath, 'index.html');

  constructor(private readonly routePrefix: RoutePrefix) {}

  private sendIndexIfAvailable: express.RequestHandler = (
    _request,
    response,
    next,
  ) => {
    return response.sendFile(
      this.indexPath,
      { headers: PublicStaticContent.securityHeaders },
      (error) => {
        if (error) {
          next();
        }
      },
    );
  };

  public register(app: express.Application): void {
    if (this.routePrefix.isEmpty()) {
      app.use(this.staticMiddleware);
      app.get('/{*publicPath}', this.sendIndexIfAvailable);

      return;
    }

    app.use((request, response, next) => {
      if (this.routePrefix.includes(request.path)) {
        next();

        return;
      }

      this.staticMiddleware(request, response, next);
    });

    app.get('/{*publicPath}', (request, response, next) => {
      if (this.routePrefix.includes(request.path)) {
        next();

        return;
      }

      this.sendIndexIfAvailable(request, response, next);
    });
  }
}
