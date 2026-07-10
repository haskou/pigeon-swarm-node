import { Kernel } from '@haskou/ddd-kernel';
import { IdempotencyConsumerMiddleware } from '@haskou/ddd-kernel/adapters/pubsub';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import {
  ExpressKernelServer,
  HttpErrorHandler,
  RoutePrefix,
} from '@haskou/ddd-kernel/adapters/ui';
import Scheduler from '@haskou/ddd-kernel/scheduler';
import path from 'path';
import { getMetadataArgsStorage } from 'routing-controllers';

import CallParticipantLeaseRepository from '../contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import InMemoryCallParticipantLeaseRepository from '../contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import NodeNetworkSynchronizationMonitor from '../contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import NodeLoader from '../contexts/nodes/application/load/NodeLoader';
import IdentityPresenceRepository from '../contexts/presence/domain/repositories/IdentityPresenceRepository';
import InMemoryIdentityPresenceRepository from '../contexts/presence/infrastructure/memory/InMemoryIdentityPresenceRepository';
import { pigeonEnvironmentSchema } from '../shared/infrastructure/environment/PigeonEnvironment';
import HttpRequestContext from '../shared/infrastructure/express/HttpRequestContext';
import {
  handleCustomHttpError,
  handleDomainError,
} from '../shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { PublicStaticContent } from '../shared/infrastructure/express/PublicStaticContent';
import { Initializer } from '../shared/infrastructure/lifecycle/Initializer';
import { Runtime } from '../shared/infrastructure/lifecycle/Runtime';
import WinstonLogger from '../shared/infrastructure/logs/WinstonLogger';
import { DomainEventConsumer } from '../shared/infrastructure/messageBus/DomainEventConsumer';
import { DomainEventPublisher } from '../shared/infrastructure/messageBus/DomainEventPublisher';
import LocalProcessedDomainEventIdempotencyStore from '../shared/infrastructure/messageBus/LocalProcessedDomainEventIdempotencyStore';
import MessageBus from '../shared/infrastructure/messageBus/MessageBus';
import WebSocketClientMessageHandler from '../shared/infrastructure/websocket/WebSocketClientMessageHandler';
import { webSocketEventHub } from '../shared/infrastructure/websocket/WebSocketEventHub';
import { WebSocketRealtimeServer } from '../shared/infrastructure/websocket/WebSocketRealtimeServer';
import { ApiSwaggerRegistrar } from './apis/ApiSwaggerRegistrar';
import { applicationRoutes } from './ApplicationRoutes';
import { ApplicationServiceClass } from './ApplicationServiceClass';

export default class PigeonApplication {
  private readonly logger = new WinstonLogger();
  private readonly kernel = new Kernel({
    environmentSchema: pigeonEnvironmentSchema,
    logger: this.logger,
    sourceDirectory: path.resolve(__dirname, '..'),
  });

  private server: ExpressKernelServer | undefined;
  private readonly swaggerRegistrar = new ApiSwaggerRegistrar();
  private readonly webSocketRealtimeServer = new WebSocketRealtimeServer();

  private getRoutePrefix(): RoutePrefix {
    return RoutePrefix.fromEnvironment(this.kernel.environment.ROUTE_PREFIX);
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
              this.swaggerRegistrar.register(app, routePrefixValue);
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

  public loadEnvironmentVariables(environment?: string): void {
    this.kernel.loadEnvironmentVariables(environment);
  }

  public async dependencyInjection(): Promise<void> {
    await this.kernel.dependencyInjection({
      containerBuild: this.kernel.environment.CONTAINER_BUILD,
      overrides: [
        { token: DomainEventConsumer, useClass: MessageBus },
        { token: DomainEventPublisher, useClass: MessageBus },
        {
          token: CallParticipantLeaseRepository,
          useClass: InMemoryCallParticipantLeaseRepository,
        },
        {
          token: IdentityPresenceRepository,
          useClass: InMemoryIdentityPresenceRepository,
        },
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
    const networkSynchronizationMonitor =
      this.kernel.di.getService<NodeNetworkSynchronizationMonitor>(
        NodeNetworkSynchronizationMonitor,
      );

    webSocketEventHub.setClientMessageHandler(
      this.kernel.di.getService<WebSocketClientMessageHandler>(
        WebSocketClientMessageHandler,
      ),
    );
    webSocketEventHub.setNetworkSynchronizationStatusProvider(() =>
      networkSynchronizationMonitor.read().toPrimitives(),
    );
    networkSynchronizationMonitor.onChanged((status) =>
      webSocketEventHub.publishNetworkSynchronizationStatus(
        status.toPrimitives(),
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
    this.kernel.registerConsumers(...ClassDefinitions);
  }

  public async runConsumers(): Promise<void> {
    await this.kernel.runConsumers();
  }

  public addSchedulers(
    ...ClassDefinitions: ApplicationServiceClass<Scheduler>[]
  ): void {
    this.kernel.registerSchedulers(...ClassDefinitions);
  }

  public async runSchedulers(): Promise<void> {
    await this.kernel.runSchedulers();
  }

  public async runInitializers(
    ...ClassDefinitions: ApplicationServiceClass<Initializer>[]
  ): Promise<void> {
    await this.kernel.runInitializers(...ClassDefinitions);
  }

  public async runRuntimes(
    ...ClassDefinitions: ApplicationServiceClass<Runtime>[]
  ): Promise<void> {
    await this.kernel.runRuntimes(...ClassDefinitions);
  }

  public async runSchedulerNowAndSchedule(
    ClassDefinition: ApplicationServiceClass<Scheduler>,
  ): Promise<void> {
    await this.kernel.runSchedulerNowAndSchedule(ClassDefinition);
  }

  public logs(prefix?: string): void {
    this.logger.run(prefix);
  }

  public async loadLocalNodeState(): Promise<void> {
    const nodeLoader = this.kernel.di.getService<NodeLoader>(NodeLoader);

    await nodeLoader.loadNode();
  }
}
