import { createExpressServer } from 'routing-controllers';
import ConsumeDlxRoute from '../ui/routes/ConsumeDlxRoute';
import HealthRoute from '../ui/routes/HealthRoute';
import { HttpErrorHandler } from './HttpErrorHandler';
import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';
import fs from 'fs';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import * as express from 'express';
import * as shttp from 'http';
import { GetExampleRoute } from '@app/apps/example-api/routes/GetExampleRoute';

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

  public run(): void {
    this._app = createExpressServer({
      routePrefix: `${process.env.ROUTE_PREFIX}`,
      cors: true,
      controllers: [HealthRoute, ConsumeDlxRoute, GetExampleRoute],
      defaultErrorHandler: false,
      middlewares: [HttpErrorHandler],
    });
    this._server = this.app.listen(process.env.API_PORT || 8080);

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
  }
}
