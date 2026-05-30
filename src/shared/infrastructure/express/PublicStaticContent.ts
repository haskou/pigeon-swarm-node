import * as express from 'express';
import path from 'path';

import { RoutePrefix } from './RoutePrefix';

export class PublicStaticContent {
  private readonly publicPath = path.resolve(process.cwd(), 'public');
  private readonly staticMiddleware = express.static(this.publicPath, {
    setHeaders: (response, filePath) => {
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
    return response.sendFile(this.indexPath, (error) => {
      if (error) {
        next();
      }
    });
  };

  public register(app: express.Application): void {
    if (this.routePrefix.isEmpty()) {
      app.use(this.staticMiddleware);
      app.get('*', this.sendIndexIfAvailable);

      return;
    }

    app.use((request, response, next) => {
      if (this.routePrefix.includes(request.path)) {
        next();

        return;
      }

      this.staticMiddleware(request, response, next);
    });

    app.get('*', (request, response, next) => {
      if (this.routePrefix.includes(request.path)) {
        next();

        return;
      }

      this.sendIndexIfAvailable(request, response, next);
    });
  }
}
