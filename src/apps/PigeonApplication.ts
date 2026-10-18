import { JsonBodyContentTypeGuard } from '@app/apps/apis/shared/JsonBodyContentTypeGuard';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import DeviceAuthorizationPublicMutationAuthorization from '@app/contexts/public-mutations/infrastructure/DeviceAuthorizationPublicMutationAuthorization';
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

import CallEventAttestor from '../contexts/calls/application/attest-event/CallEventAttestor';
import CallParticipantLeaseRepository from '../contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallSignalDeliveryRepository from '../contexts/calls/domain/repositories/CallSignalDeliveryRepository';
import InMemoryCallParticipantLeaseRepository from '../contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import InMemoryCallSignalDeliveryRepository from '../contexts/calls/infrastructure/memory/InMemoryCallSignalDeliveryRepository';
import PrivateCommunityControlApplier from '../contexts/communities/application/apply-private-control/PrivateCommunityControlApplier';
import PrivateCommunityGenesisAuthorizer from '../contexts/communities/application/apply-private-control/PrivateCommunityGenesisAuthorizer';
import CommunityRepository from '../contexts/communities/domain/repositories/CommunityRepository';
import CommunityRepositoryRouter from '../contexts/communities/infrastructure/CommunityRepositoryRouter';
import { ContentReplicationLimits } from '../contexts/content-replication/domain/ContentReplicationLimits';
import { ContentReplicationNetworkBudget } from '../contexts/content-replication/domain/ContentReplicationNetworkBudget';
import { ContentReplicationLimitsFromEnvironment } from '../contexts/content-replication/infrastructure/environment/ContentReplicationLimitsFromEnvironment';
import { ContentReplicationNetworkBudgetFromEnvironment } from '../contexts/content-replication/infrastructure/environment/ContentReplicationNetworkBudgetFromEnvironment';
import DiagnosticsSessionRepository from '../contexts/diagnostics/domain/repositories/DiagnosticsSessionRepository';
import InMemoryDiagnosticsSessionRepository from '../contexts/diagnostics/infrastructure/memory/InMemoryDiagnosticsSessionRepository';
import { DeviceAuthorizationRepository } from '../contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealedSecretRepository } from '../contexts/identity-devices/domain/repositories/DeviceSealedSecretRepository';
import LocalDeviceSealedSecretRepository from '../contexts/identity-devices/infrastructure/local-db/LocalDeviceSealedSecretRepository';
import OrbitDBDeviceAuthorizationRepository from '../contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationRepository';
import { MailboxLimits } from '../contexts/mailboxes/domain/MailboxLimits';
import MailboxRepository from '../contexts/mailboxes/domain/repositories/MailboxRepository';
import { MailboxLimitsFromEnvironment } from '../contexts/mailboxes/infrastructure/environment/MailboxLimitsFromEnvironment';
import LocalMailboxRepository from '../contexts/mailboxes/infrastructure/local-db/LocalMailboxRepository';
import NodeNetworkSynchronizationMonitor from '../contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import NodeLoader from '../contexts/nodes/application/load/NodeLoader';
import { NodeCommunityStateWasAnnounced } from '../contexts/nodes/domain/events/NodeCommunityStateWasAnnounced';
import { NodeBlockSourceFetchLimits } from '../contexts/nodes/domain/NodeBlockSourceFetchLimits';
import { NodeRegistrationCodeLimits } from '../contexts/nodes/domain/NodeRegistrationCodeLimits';
import { NodeBlockSourceFetchLimitsFromEnvironment } from '../contexts/nodes/infrastructure/environment/NodeBlockSourceFetchLimitsFromEnvironment';
import { NodeRegistrationCodeLimitsFromEnvironment } from '../contexts/nodes/infrastructure/environment/NodeRegistrationCodeLimitsFromEnvironment';
import NotificationScopeSettingsRepository from '../contexts/notification-settings/domain/repositories/NotificationScopeSettingsRepository';
import NotificationScopeSettingsRepositoryRouter from '../contexts/notification-settings/infrastructure/NotificationScopeSettingsRepositoryRouter';
import { NotificationReplicationLimits } from '../contexts/notifications/domain/NotificationReplicationLimits';
import { PendingGroupInvitationLimits } from '../contexts/notifications/domain/PendingGroupInvitationLimits';
import NotificationRepository from '../contexts/notifications/domain/repositories/NotificationRepository';
import { NotificationReplicationLimitsFromEnvironment } from '../contexts/notifications/infrastructure/environment/NotificationReplicationLimitsFromEnvironment';
import { PendingGroupInvitationLimitsFromEnvironment } from '../contexts/notifications/infrastructure/environment/PendingGroupInvitationLimitsFromEnvironment';
import NotificationRepositoryRouter from '../contexts/notifications/infrastructure/NotificationRepositoryRouter';
import IdentityPresenceRepository from '../contexts/presence/domain/repositories/IdentityPresenceRepository';
import InMemoryIdentityPresenceRepository from '../contexts/presence/infrastructure/memory/InMemoryIdentityPresenceRepository';
import { PrivateControlMutationAuthorizer } from '../contexts/private-authorization/application/accept-operation/PrivateControlMutationAuthorizer';
import { PrivateControlTransitionProcessor } from '../contexts/private-authorization/application/accept-operation/PrivateControlTransitionProcessor';
import { PrivateFreshnessGate } from '../contexts/private-authorization/application/accept-operation/PrivateFreshnessGate';
import { PrivateOperationAuthenticator } from '../contexts/private-authorization/application/accept-operation/PrivateOperationAuthenticator';
import { PrivateOperationDecoder } from '../contexts/private-authorization/application/accept-operation/PrivateOperationDecoder';
import { PrivateOperationUnitOfWork } from '../contexts/private-authorization/application/PrivateOperationUnitOfWork';
import { PrivateGenesisAuthenticator } from '../contexts/private-authorization/application/provision-scope/PrivateGenesisAuthenticator';
import { PrivateGenesisProjectionAuthorizer } from '../contexts/private-authorization/application/provision-scope/PrivateGenesisProjectionAuthorizer';
import { PrivateAuthorizationRepository } from '../contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { PrivateDeviceCredentialCodec } from '../contexts/private-authorization/domain/services/PrivateDeviceCredentialCodec';
import PrivateControlOperationContract from '../contexts/private-authorization/infrastructure/contracts/PrivateControlOperationContract';
import Ed25519PrivateDeviceCredentialCodec from '../contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import PrivateGenesisVerifier from '../contexts/private-authorization/infrastructure/crypto/PrivateGenesisVerifier';
import PrivateOperationVerifier from '../contexts/private-authorization/infrastructure/crypto/PrivateOperationVerifier';
import VerifiedPrivateControlTransitionProcessor from '../contexts/private-authorization/infrastructure/crypto/VerifiedPrivateControlTransitionProcessor';
import InMemoryPrivateFreshnessGate from '../contexts/private-authorization/infrastructure/freshness/InMemoryPrivateFreshnessGate';
import LocalPrivateAuthorizationRepository from '../contexts/private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository';
import LocalPrivateOperationUnitOfWork from '../contexts/private-authorization/infrastructure/local-db/LocalPrivateOperationUnitOfWork';
import { PrivateBlobLimits } from '../contexts/private-blobs/domain/PrivateBlobLimits';
import PrivateBlobBytesStore from '../contexts/private-blobs/domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../contexts/private-blobs/domain/repositories/PrivateBlobRepository';
import PrivateBlobOwnerKeyDeriver from '../contexts/private-blobs/domain/services/PrivateBlobOwnerKeyDeriver';
import { PrivateBlobLimitsFromEnvironment } from '../contexts/private-blobs/infrastructure/environment/PrivateBlobLimitsFromEnvironment';
import FilePrivateBlobBytesStore from '../contexts/private-blobs/infrastructure/filesystem/FilePrivateBlobBytesStore';
import LocalPrivateBlobOwnerKeyDeriver from '../contexts/private-blobs/infrastructure/local-db/LocalPrivateBlobOwnerKeyDeriver';
import LocalPrivateBlobRepository from '../contexts/private-blobs/infrastructure/local-db/LocalPrivateBlobRepository';
import { IdentityId } from '../contexts/shared/domain/value-objects/IdentityId';
import {
  pigeonEnvironmentSchema,
  validatePigeonEnvironment,
} from '../shared/infrastructure/environment/PigeonEnvironment';
import InitializerTimedOutError from '../shared/infrastructure/errors/InitializerTimedOutError';
import HttpRequestContext from '../shared/infrastructure/express/HttpRequestContext';
import {
  handleCustomHttpError,
  handleDomainError,
} from '../shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { PublicStaticContent } from '../shared/infrastructure/express/PublicStaticContent';
import { parseTrustProxySetting } from '../shared/infrastructure/express/TrustProxySetting';
import { Initializer } from '../shared/infrastructure/lifecycle/Initializer';
import { Runtime } from '../shared/infrastructure/lifecycle/Runtime';
import WinstonLogger from '../shared/infrastructure/logs/WinstonLogger';
import { DomainEventConsumer } from '../shared/infrastructure/messageBus/DomainEventConsumer';
import { DomainEventPublisher } from '../shared/infrastructure/messageBus/DomainEventPublisher';
import { LocalDomainEventPublisher } from '../shared/infrastructure/messageBus/LocalDomainEventPublisher';
import LocalProcessedDomainEventIdempotencyStore from '../shared/infrastructure/messageBus/LocalProcessedDomainEventIdempotencyStore';
import MessageBus from '../shared/infrastructure/messageBus/MessageBus';
import WebSocketClientMessageHandler from '../shared/infrastructure/websocket/WebSocketClientMessageHandler';
import { webSocketEventHub } from '../shared/infrastructure/websocket/WebSocketEventHub';
import { WebSocketRealtimeServer } from '../shared/infrastructure/websocket/WebSocketRealtimeServer';
import { ApiSwaggerRegistrar } from './apis/ApiSwaggerRegistrar';
import { applicationRoutes } from './ApplicationRoutes';
import { ApplicationServiceClass } from './ApplicationServiceClass';
import NodeOwnerResetCommand from './commands/nodes/NodeOwnerResetCommand';

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
          {
            // Strict routing makes `/calls/` a different path from `/calls`,
            // so a trailing slash names no route. Express builds its router
            // on the first `use`, so the setting precedes every middleware.
            handle: (app) => {
              app.set('strict routing', true);
              app.set(
                'trust proxy',
                parseTrustProxySetting(this.kernel.environment.API_TRUST_PROXY),
              );
              app.use((request, _response, next) => {
                HttpRequestContext.run(request, next);
              });
              app.use(
                new JsonBodyContentTypeGuard(routePrefixValue).middleware,
              );
            },
            phase: 'beforeControllers',
          },
        ],
        kernel: this.kernel,
        port: this.kernel.environment.API_PORT,
        routePrefix: routePrefixValue,
        routingControllersOptions: {
          cors: true,
          defaultErrorHandler: false,
          validation: {
            validationError: { target: false, value: false },
          },
        },
      });
      this.logger.attach(this.server);
    }

    return this.server;
  }

  // Autowire derives constructor arguments from TypeScript sources, which the
  // compiled build does not ship. Compiled runs load the committed
  // config/container/services.yaml, the graph autowire generates from src.
  private resolveContainerBuild(): boolean {
    if (!this.kernel.environment.CONTAINER_BUILD) {
      return false;
    }

    if (path.extname(__filename) === '.ts') {
      return true;
    }

    this.logger.warn(
      'CONTAINER_BUILD is ignored in compiled builds; loading config/container/services.yaml',
    );

    return false;
  }

  public loadEnvironmentVariables(environment?: string): void {
    this.kernel.loadEnvironmentVariables(environment);
    validatePigeonEnvironment(this.kernel.environment);
    this.logger.enableFileLogging();
  }

  public async dependencyInjection(
    options: { containerBuild?: boolean; servicesYamlPath?: string } = {},
  ): Promise<void> {
    await this.kernel.dependencyInjection({
      containerBuild: options.containerBuild ?? this.resolveContainerBuild(),
      ...(options.servicesYamlPath
        ? { servicesYamlPath: options.servicesYamlPath }
        : {}),
      overrides: [
        {
          token: CallSignalDeliveryRepository,
          useClass: InMemoryCallSignalDeliveryRepository,
        },
        { token: DomainEventConsumer, useClass: MessageBus },
        { token: DomainEventPublisher, useClass: MessageBus },
        { token: LocalDomainEventPublisher, useClass: MessageBus },
        {
          token: CallParticipantLeaseRepository,
          useClass: InMemoryCallParticipantLeaseRepository,
        },
        {
          token: DiagnosticsSessionRepository,
          useClass: InMemoryDiagnosticsSessionRepository,
        },
        {
          token: IdentityPresenceRepository,
          useClass: InMemoryIdentityPresenceRepository,
        },
        {
          token: PublicMutationAuthorAuthorization,
          useClass: DeviceAuthorizationPublicMutationAuthorization,
        },
        {
          token: DeviceAuthorizationRepository,
          useClass: OrbitDBDeviceAuthorizationRepository,
        },
        { token: MailboxRepository, useClass: LocalMailboxRepository },
        {
          token: DeviceSealedSecretRepository,
          useClass: LocalDeviceSealedSecretRepository,
        },
        { token: PrivateBlobRepository, useClass: LocalPrivateBlobRepository },
        { token: PrivateBlobBytesStore, useClass: FilePrivateBlobBytesStore },
        {
          token: PrivateBlobOwnerKeyDeriver,
          useClass: LocalPrivateBlobOwnerKeyDeriver,
        },
        {
          token: PrivateAuthorizationRepository,
          useClass: LocalPrivateAuthorizationRepository,
        },
        {
          token: PrivateOperationUnitOfWork,
          useClass: LocalPrivateOperationUnitOfWork,
        },
        {
          token: PrivateOperationAuthenticator,
          useClass: PrivateOperationVerifier,
        },
        {
          token: PrivateOperationDecoder,
          useClass: PrivateControlOperationContract,
        },
        {
          token: PrivateFreshnessGate,
          useClass: InMemoryPrivateFreshnessGate,
        },
        {
          token: PrivateControlTransitionProcessor,
          useClass: VerifiedPrivateControlTransitionProcessor,
        },
        {
          token: PrivateDeviceCredentialCodec,
          useClass: Ed25519PrivateDeviceCredentialCodec,
        },
        {
          token: PrivateControlMutationAuthorizer,
          useClass: PrivateCommunityControlApplier,
        },
        {
          token: PrivateGenesisAuthenticator,
          useClass: PrivateGenesisVerifier,
        },
        {
          token: PrivateGenesisProjectionAuthorizer,
          useClass: PrivateCommunityGenesisAuthorizer,
        },
        {
          token: CommunityRepository,
          useClass: CommunityRepositoryRouter,
        },
        {
          token: NotificationScopeSettingsRepository,
          useClass: NotificationScopeSettingsRepositoryRouter,
        },
        {
          token: NotificationRepository,
          useClass: NotificationRepositoryRouter,
        },
        {
          token: MailboxLimits,
          useFactory: () => MailboxLimitsFromEnvironment.load(),
        },
        {
          token: NodeBlockSourceFetchLimits,
          useFactory: () => NodeBlockSourceFetchLimitsFromEnvironment.load(),
        },
        {
          token: PrivateBlobLimits,
          useFactory: () => PrivateBlobLimitsFromEnvironment.load(),
        },
        {
          token: ContentReplicationLimits,
          useFactory: () => ContentReplicationLimitsFromEnvironment.load(),
        },
        {
          token: ContentReplicationNetworkBudget,
          useFactory: () =>
            ContentReplicationNetworkBudgetFromEnvironment.load(),
        },
        {
          token: NotificationReplicationLimits,
          useFactory: () => NotificationReplicationLimitsFromEnvironment.load(),
        },
        {
          token: PendingGroupInvitationLimits,
          useFactory: () => PendingGroupInvitationLimitsFromEnvironment.load(),
        },
        {
          token: NodeRegistrationCodeLimits,
          useFactory: () => NodeRegistrationCodeLimitsFromEnvironment.load(),
        },
      ],
    });
    const idempotency = new IdempotencyConsumerMiddleware({
      key: (_event, context) => `${context.queueName}:${context.eventId}`,
      store:
        this.kernel.di.getService<LocalProcessedDomainEventIdempotencyStore>(
          LocalProcessedDomainEventIdempotencyStore,
        ),
    });

    // Community state announcements repeat every few seconds and are idempotent:
    // recording each delivery durably would grow the local database forever.
    this.kernel.registerConsumerMiddleware({
      handle: (event, next, context) =>
        context.eventName === NodeCommunityStateWasAnnounced.EVENT_NAME
          ? next()
          : idempotency.handle(event, next, context),
    });
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
    webSocketEventHub.setCallEventAttestor(
      this.kernel.di.getService<CallEventAttestor>(CallEventAttestor),
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
    const routePrefix = this.getRoutePrefix().toString();

    await server.run();

    // ExpressKernelServer.run() also resolves when listen fails (Express 5
    // passes the `error` event to the listen callback), so an API port already
    // in use would leave the node running without its API.
    if (!server.server.listening) {
      throw new Error(
        `API server could not listen on port ${this.kernel.environment.API_PORT}`,
      );
    }

    this.webSocketRealtimeServer.attach(
      server.server,
      `${routePrefix}/realtime`,
    );
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

  // Runs the initializers one by one, each bounded by
  // NODE_INITIALIZER_TIMEOUT_MS, so a hung one fails startup instead of
  // leaving the node up with its API never listening.
  public async runInitializers(
    ...ClassDefinitions: ApplicationServiceClass<Initializer>[]
  ): Promise<void> {
    const timeoutMs = this.kernel.environment.NODE_INITIALIZER_TIMEOUT_MS;

    for (const ClassDefinition of ClassDefinitions) {
      const timedOut = Promise.withResolvers<never>();
      const deadline = setTimeout(
        () =>
          timedOut.reject(
            new InitializerTimedOutError(ClassDefinition.name, timeoutMs),
          ),
        timeoutMs,
      );

      try {
        await Promise.race([
          this.kernel.di.getService<Initializer>(ClassDefinition).ensure(),
          timedOut.promise,
        ]);
      } finally {
        clearTimeout(deadline);
      }
    }
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

  /** Runs `yarn node:reset-owner <new owner identity id>`; returns the report for the operator. */
  public async resetNodeOwner(newOwner: IdentityId): Promise<string> {
    return this.kernel.di
      .getService<NodeOwnerResetCommand>(NodeOwnerResetCommand)
      .run(newOwner);
  }

  public async shutdown(): Promise<void> {
    await this.kernel.shutdown();
  }
}
