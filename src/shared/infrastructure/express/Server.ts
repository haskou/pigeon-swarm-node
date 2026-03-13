import { GetExampleRoute } from '@app/apps/example-api/routes/GetExampleRoute';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import * as express from 'express';
import fs from 'fs';
import * as shttp from 'http';
import { createExpressServer } from 'routing-controllers';
import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';

import ConsumeDlxRoute from '../ui/routes/ConsumeDlxRoute';
import HealthRoute from '../ui/routes/HealthRoute';
import { HttpErrorHandler } from './HttpErrorHandler';

type HttpApp = express.Application;
type HttpServer = shttp.Server;

export default class Server {
  private _app: HttpApp;
  private _server: HttpServer;

  public get app(): HttpApp {
    return this._app;
  }

  public get server(): HttpServer {
    return this._server;
  }

  public run(): Promise<void> {
    return new Promise((resolve) => {
      this._app = createExpressServer({
        controllers: [HealthRoute, ConsumeDlxRoute, GetExampleRoute],
        cors: true,
        defaultErrorHandler: false,
        middlewares: [HttpErrorHandler],
        routePrefix: `${process.env.ROUTE_PREFIX}`,
      });
      this._server = this.app.listen(process.env.API_PORT || 8080, () => {
        resolve();
      });

      if (process.env.GENERATE_API_DOCS === 'true') {
        // Generate Swagger
        const schemas = validationMetadatasToSchemas({
          refPointerPrefix: '#/components/schemas/',
        });

        const storage = getMetadataArgsStorage();
        const spec = routingControllersToSpec(
          storage,
          {},
          {
            components: {
              ...schemas,
              securitySchemes: {
                bearerAuth: {
                  scheme: 'bearer',
                  type: 'http',
                },
              },
            },
          },
        );
        fs.writeFileSync('./open-api.json', JSON.stringify(spec), 'utf-8');
      }
    });
  }
}
