import { Kernel } from '@haskou/ddd-kernel';
import { IdempotencyConsumerMiddleware } from '@haskou/ddd-kernel/adapters/pubsub';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import {
  ExpressKernelServer,
  HttpApp,
  HttpErrorHandler,
  RoutePrefix,
} from '@haskou/ddd-kernel/adapters/ui';
import {
  DomainEventConsumer,
  DomainEventPublisher,
} from '@haskou/ddd-kernel/domain';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import path from 'path';
import { getMetadataArgsStorage } from 'routing-controllers';

import NodeLoader from '../contexts/nodes/application/load/NodeLoader';
import { pigeonEnvironmentSchema } from '../shared/infrastructure/environment/PigeonEnvironment';
import HttpRequestContext from '../shared/infrastructure/express/HttpRequestContext';
import {
  handleCustomHttpError,
  handleDomainError,
} from '../shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { PublicStaticContent } from '../shared/infrastructure/express/PublicStaticContent';
import { SwaggerRouteMap } from '../shared/infrastructure/express/SwaggerRouteMap';
import { Initializer } from '../shared/infrastructure/lifecycle/Initializer';
import { Runtime } from '../shared/infrastructure/lifecycle/Runtime';
import WinstonLogger from '../shared/infrastructure/logs/WinstonLogger';
import LocalProcessedDomainEventIdempotencyStore from '../shared/infrastructure/messageBus/LocalProcessedDomainEventIdempotencyStore';
import MessageBus from '../shared/infrastructure/messageBus/MessageBus';
import WebSocketClientMessageHandler from '../shared/infrastructure/websocket/WebSocketClientMessageHandler';
import { webSocketEventHub } from '../shared/infrastructure/websocket/WebSocketEventHub';
import { WebSocketRealtimeServer } from '../shared/infrastructure/websocket/WebSocketRealtimeServer';
import { ApiSwaggerFactory } from './apis/ApiSwaggerFactory';
import { applicationRoutes } from './ApplicationRoutes';
import { ApplicationServiceClass } from './ApplicationServiceClass';

export default class PigeonApplication {
  private readonly consumers: Consumer[] = [];
  private readonly logger = new WinstonLogger();
  private readonly kernel = new Kernel({
    environmentSchema: pigeonEnvironmentSchema,
    logger: this.logger,
    sourceDirectory: path.resolve(__dirname, '..'),
  });

  private readonly schedulers: Scheduler[] = [];
  private server: ExpressKernelServer | undefined;
  private readonly webSocketRealtimeServer = new WebSocketRealtimeServer();

  private getRoutePrefix(): RoutePrefix {
    return RoutePrefix.fromEnvironment(this.kernel.environment.ROUTE_PREFIX);
  }

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

  private registerSwagger(app: HttpApp, routePrefixValue: string): void {
    const swaggerFactory = new ApiSwaggerFactory();
    const swaggerByApi = swaggerFactory.createByApi();
    const aggregatedSwagger = swaggerFactory.createAggregatedSpec();
    const swaggerRoutes = swaggerFactory.createRouteByApi(routePrefixValue);
    const swaggerHtml = this.buildSwaggerHtml(routePrefixValue, swaggerRoutes);

    app.get(
      `${routePrefixValue}/swagger/open-api.yaml`,
      (_request, response) => {
        return response.type('application/yaml').send(aggregatedSwagger);
      },
    );

    app.get(`${routePrefixValue}/swagger`, (_request, response) => {
      return response.type('text/html').send(swaggerHtml);
    });

    for (const [apiName, swaggerSpec] of Object.entries(swaggerByApi)) {
      app.get(swaggerRoutes[apiName], (_request, response) => {
        return response.type('application/yaml').send(swaggerSpec);
      });
    }
  }

  private routeSpecificity(route: string | RegExp | undefined): number {
    if (!route || route instanceof RegExp) {
      return 0;
    }

    return route
      .split('/')
      .filter((segment) => segment.length > 0)
      .reduce((score, segment) => score + (segment.startsWith(':') ? 0 : 1), 0);
  }

  private controllerSpecificity(target: object): number {
    return Math.max(
      0,
      ...getMetadataArgsStorage()
        .actions.filter((action) => action.target === target)
        .map((action) => this.routeSpecificity(action.route)),
    );
  }

  private prioritizeSpecificRoutes(): void {
    const metadataStorage = getMetadataArgsStorage();

    metadataStorage.controllers.sort((left, right) => {
      if (left.route !== right.route) {
        return 0;
      }

      return (
        this.controllerSpecificity(right.target) -
        this.controllerSpecificity(left.target)
      );
    });

    metadataStorage.actions.sort((left, right) => {
      if (left.type !== right.type) {
        return 0;
      }

      return (
        this.routeSpecificity(right.route) - this.routeSpecificity(left.route)
      );
    });
  }

  private getServer(): ExpressKernelServer {
    if (!this.server) {
      this.prioritizeSpecificRoutes();

      const routePrefix = this.getRoutePrefix();
      const routePrefixValue = routePrefix.toString();
      const errorHandler = new HttpErrorHandler({
        handlers: [handleDomainError, handleCustomHttpError],
        logger: this.logger,
      });

      this.server = new ExpressKernelServer({
        controllers: applicationRoutes,
        errorHandlers: [errorHandler.handle],
        hooks: [
          {
            handle: (app) => {
              this.registerSwagger(app, routePrefixValue);
              new PublicStaticContent(routePrefix).register(app);
            },
            phase: 'beforeErrors',
          },
        ],
        kernel: this.kernel,
        port: this.kernel.environment.API_PORT,
        preControllerMiddlewares: [
          (request, _response, next) => {
            HttpRequestContext.run(request, next);
          },
        ],
        routePrefix: routePrefixValue,
        routingControllersOptions: {
          cors: true,
          defaultErrorHandler: false,
        },
      });
      this.logger.attach(this.server);
    }

    return this.server;
  }

  private getConsumerFromClass(
    ClassDefinition: ApplicationServiceClass<Consumer>,
  ): Consumer {
    return this.kernel.di.getService<Consumer>(ClassDefinition);
  }

  private getInitializerFromClass(
    ClassDefinition: ApplicationServiceClass<Initializer>,
  ): Initializer {
    return this.kernel.di.getService<Initializer>(ClassDefinition);
  }

  private getRuntimeFromClass(
    ClassDefinition: ApplicationServiceClass<Runtime>,
  ): Runtime {
    return this.kernel.di.getService<Runtime>(ClassDefinition);
  }

  private getSchedulerFromClass(
    ClassDefinition: ApplicationServiceClass<Scheduler>,
  ): Scheduler {
    return this.kernel.di.getService<Scheduler>(ClassDefinition);
  }

  public loadEnvironmentVariables(environment?: string): void {
    this.kernel.loadEnvironmentVariables(environment);
  }

  public async dependencyInjection(): Promise<void> {
    await this.kernel.dependencyInjection({
      containerBuild:
        this.kernel.environment.CONTAINER_BUILD ||
        this.kernel.environment.NODE_ENV !== 'production',
      overrides: [
        { token: DomainEventConsumer, useClass: MessageBus },
        { token: DomainEventPublisher, useClass: MessageBus },
      ],
    });
    this.kernel.registerConsumerMiddleware(
      new IdempotencyConsumerMiddleware({
        key: (_event, context) => `${context.queueName}:${context.eventId}`,
        store:
          this.kernel.di.getService<LocalProcessedDomainEventIdempotencyStore>(
            LocalProcessedDomainEventIdempotencyStore,
          ),
      }),
    );
  }

  public configureWebSocketEventHub(): void {
    webSocketEventHub.setClientMessageHandler(
      this.kernel.di.getService<WebSocketClientMessageHandler>(
        WebSocketClientMessageHandler,
      ),
    );
  }

  public async runServer(): Promise<void> {
    const server = this.getServer();
    const websocketPath = `${this.getRoutePrefix().toString()}/ws`;

    await server.run();
    this.webSocketRealtimeServer.attach(server.server, websocketPath);
  }

  public addConsumers(
    ...ClassDefinitions: ApplicationServiceClass<Consumer>[]
  ): void {
    for (const ClassDefinition of ClassDefinitions) {
      const consumer = this.getConsumerFromClass(ClassDefinition);

      this.consumers.push(consumer);
      this.kernel.registerConsumerInstances(consumer);
    }
  }

  public async runConsumers(): Promise<void> {
    for (const consumer of this.consumers) {
      await consumer.init();
    }
  }

  public addSchedulers(
    ...ClassDefinitions: ApplicationServiceClass<Scheduler>[]
  ): void {
    for (const ClassDefinition of ClassDefinitions) {
      this.schedulers.push(this.getSchedulerFromClass(ClassDefinition));
    }
  }

  public async runSchedulers(): Promise<void> {
    for (const scheduler of this.schedulers) {
      await scheduler.init();
    }
  }

  public async runInitializers(
    ...ClassDefinitions: ApplicationServiceClass<Initializer>[]
  ): Promise<void> {
    for (const ClassDefinition of ClassDefinitions) {
      await this.getInitializerFromClass(ClassDefinition).ensure();
    }
  }

  public async runRuntimes(
    ...ClassDefinitions: ApplicationServiceClass<Runtime>[]
  ): Promise<void> {
    for (const ClassDefinition of ClassDefinitions) {
      await this.getRuntimeFromClass(ClassDefinition).run();
    }
  }

  public async runSchedulerNowAndSchedule(
    ClassDefinition: ApplicationServiceClass<Scheduler>,
  ): Promise<void> {
    const scheduler = this.getSchedulerFromClass(ClassDefinition);

    await scheduler.runOnce();
    await scheduler.init();
  }

  public logs(prefix?: string): void {
    this.logger.run(prefix);
  }

  public async loadLocalNodeState(): Promise<void> {
    const nodeLoader = this.kernel.di.getService<NodeLoader>(NodeLoader);

    await nodeLoader.loadNode();
  }
}
