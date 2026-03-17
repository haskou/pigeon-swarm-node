import { ApiSwaggerFactory } from '@app/apps/apis/ApiSwaggerFactory';
import { GetExampleRoute } from '@app/apps/apis/example-api/routes/GetExampleRoute';
import { PostIdentityRoute } from '@app/apps/apis/identities-api/routes/PostIdentityRoute';
import { GetIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/GetIPFSContentRoute';
import * as express from 'express';
import * as shttp from 'http';
import { createExpressServer } from 'routing-controllers';

import { ServerNotRunningError } from '../errors/ServerNotRunningError';
import ConsumeDlxRoute from '../ui/routes/ConsumeDlxRoute';
import HealthRoute from '../ui/routes/HealthRoute';
import { HttpErrorHandler } from './HttpErrorHandler';

type HttpApp = express.Application;
type HttpServer = shttp.Server;
type SwaggerRouteMap = Record<string, string>;

export default class Server {
  private _app: HttpApp | undefined;
  private _server: HttpServer | undefined;

  private buildSwaggerHtml(
    routePrefix: string,
    swaggerRoutes: SwaggerRouteMap,
  ): string {
    const swaggerUrls = [
      {
        name: 'all-apis',
        url: `${routePrefix}/swagger/open-api.yaml`,
      },
      ...Object.entries(swaggerRoutes).map(([apiName, url]) => ({
        name: apiName,
        url,
      })),
    ];

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pigeon-swarm Swagger</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body {
        margin: 0;
        background: #f5f7fb;
      }

      .topbar {
        display: none;
      }

      .swagger-ui .information-container {
        padding-bottom: 0;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        dom_id: '#swagger-ui',
        layout: 'StandaloneLayout',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        urls: ${JSON.stringify(swaggerUrls)},
        "urls.primaryName": 'all-apis',
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        tryItOutEnabled: false,
      });
    </script>
  </body>
</html>`;
  }

  public get app(): HttpApp {
    if (!this._app) {
      throw new ServerNotRunningError();
    }

    return this._app;
  }

  public get server(): HttpServer {
    if (!this._server) {
      throw new ServerNotRunningError();
    }

    return this._server;
  }

  public run(): Promise<void> {
    return new Promise((resolve) => {
      const routePrefix = process.env.ROUTE_PREFIX || '';
      const swaggerFactory = new ApiSwaggerFactory();
      const swaggerByApi = swaggerFactory.createByApi();
      const aggregatedSwagger = swaggerFactory.createAggregatedSpec();
      const swaggerRoutes = swaggerFactory.createRouteByApi(routePrefix);
      const swaggerHtml = this.buildSwaggerHtml(routePrefix, swaggerRoutes);

      this._app = createExpressServer({
        controllers: [
          HealthRoute,
          ConsumeDlxRoute,
          GetExampleRoute,
          PostIdentityRoute,
          GetIPFSContentRoute,
        ],
        cors: true,
        defaultErrorHandler: false,
        middlewares: [HttpErrorHandler],
        routePrefix,
      });

      this.app.get(
        `${routePrefix}/swagger/open-api.yaml`,
        (_request, response) => {
          return response.type('application/yaml').send(aggregatedSwagger);
        },
      );

      this.app.get(`${routePrefix}/swagger`, (_request, response) => {
        return response.type('text/html').send(swaggerHtml);
      });

      for (const [apiName, swaggerSpec] of Object.entries(swaggerByApi)) {
        this.app.get(swaggerRoutes[apiName], (_request, response) => {
          return response.type('application/yaml').send(swaggerSpec);
        });
      }

      this._server = this.app.listen(process.env.API_PORT || 8080, () => {
        resolve();
      });
    });
  }
}
