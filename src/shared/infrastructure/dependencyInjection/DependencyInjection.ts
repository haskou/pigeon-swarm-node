import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import MongoCallRepository from '@app/contexts/calls/infrastructure/mongo/MongoCallRepository';
import CommunityChannelDraftRepository from '@app/contexts/communities/domain/repositories/CommunityChannelDraftRepository';
import CommunityChannelMessagePinRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessagePinRepository';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import CommunityModerationLogRepository from '@app/contexts/communities/domain/repositories/CommunityModerationLogRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import CommunityRequestStore from '@app/contexts/communities/domain/repositories/CommunityRequestStore';
import MongoCommunityChannelDraftRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelDraftRepository';
import MongoCommunityChannelMessagePinRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessagePinRepository';
import MongoCommunityModerationLogRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityModerationLogRepository';
import OrbitDBCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessageRepository';
import OrbitDBCommunityInviteRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInviteRepository';
import OrbitDBCommunityMessageReactionRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityMessageReactionRepository';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import OrbitDBCommunityRequestStore from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRequestStore';
import ConversationDraftRepository from '@app/contexts/conversations/domain/repositories/ConversationDraftRepository';
import ConversationMessagePinRepository from '@app/contexts/conversations/domain/repositories/ConversationMessagePinRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import MongoConversationDraftRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationDraftRepository';
import MongoConversationMessagePinRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationMessagePinRepository';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import OrbitDBMessageReactionRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBMessageReactionRepository';
import IdentityMetadataRepository from '@app/contexts/identities/domain/repositories/IdentityMetadataRepository';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IpfsIdentityRepository from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRepository';
import OrbitDBIdentityMetadataRepository from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataRepository';
import IPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicaClaimRepository';
import IPFSContentReplicationRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicationRepository';
import IPFSReplicationStatusSummaryRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSReplicationStatusSummaryRepository';
import MongoIPFSReplicationStatusSummaryRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSReplicationStatusSummaryRepository';
import OrbitDBIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/orbitdb/OrbitDBIPFSContentReplicaClaimRepository';
import OrbitDBIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/orbitdb/OrbitDBIPFSContentReplicationRepository';
import KeychainMetadataRepository from '@app/contexts/keychains/domain/repositories/KeychainMetadataRepository';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import IpfsKeychainRepository from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRepository';
import OrbitDBKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataRepository';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodePeerRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodePeerRepository';
import NotificationScopeSettingsRepository from '@app/contexts/notification-settings/domain/repositories/NotificationScopeSettingsRepository';
import MongoNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/mongo/MongoNotificationScopeSettingsRepository';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import OrbitDBNotificationRepository from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationRepository';
import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';
import MongoPollRepository from '@app/contexts/polls/infrastructure/mongo/MongoPollRepository';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import MongoIdentityPresenceRepository from '@app/contexts/presence/infrastructure/mongo/MongoIdentityPresenceRepository';
import PushVapidConfigurationReader from '@app/contexts/push-notifications/application/find-vapid-public-key/PushVapidConfigurationReader';
import PushNotificationDelivery from '@app/contexts/push-notifications/application/send/PushNotificationDelivery';
import PushSubscriptionRepository from '@app/contexts/push-notifications/domain/repositories/PushSubscriptionRepository';
import MongoPushSubscriptionRepository from '@app/contexts/push-notifications/infrastructure/mongo/MongoPushSubscriptionRepository';
import PushVapidConfiguration from '@app/contexts/push-notifications/infrastructure/web-push/PushVapidConfiguration';
import WebPushNotificationDelivery from '@app/contexts/push-notifications/infrastructure/web-push/WebPushNotificationDelivery';
import IPFSContentRacer from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer';
import Kernel from '@app/Kernel';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Libp2pGossipsubTransport from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubTransport';
import PubSubTransport from '@app/shared/infrastructure/pubsub/PubSubTransport';
import fs from 'fs-extra';
import {
  Autowire,
  ContainerBuilder,
  ServiceFile,
  YamlFileLoader,
} from 'node-dependency-injection';
import path from 'path';

import { ContainerDefinition } from './ContainerDefinition';
import { ExplicitServiceClass } from './ExplicitServiceClass';

export default class DependencyInjection {
  private static _instance: DependencyInjection;
  private readonly container: ContainerBuilder;
  private autowire: Autowire | undefined;
  private loader: YamlFileLoader | undefined;
  private readonly _servicesYamlPath: string = path.join(
    Kernel.configDirectory,
    'container',
    'services.yaml',
  );

  private readonly aliases = new Map<unknown, unknown>([
    [CallRepository, MongoCallRepository],
    [CommunityRepository, OrbitDBCommunityRepository],
    [CommunityChannelDraftRepository, MongoCommunityChannelDraftRepository],
    [
      CommunityChannelMessagePinRepository,
      MongoCommunityChannelMessagePinRepository,
    ],
    [
      CommunityChannelMessageRepository,
      OrbitDBCommunityChannelMessageRepository,
    ],
    [CommunityInviteRepository, OrbitDBCommunityInviteRepository],
    [
      CommunityMessageReactionRepository,
      OrbitDBCommunityMessageReactionRepository,
    ],
    [CommunityModerationLogRepository, MongoCommunityModerationLogRepository],
    [CommunityRequestStore, OrbitDBCommunityRequestStore],
    [ConversationRepository, OrbitDBConversationRepository],
    [ConversationDraftRepository, MongoConversationDraftRepository],
    [ConversationMessagePinRepository, MongoConversationMessagePinRepository],
    [IdentityMetadataRepository, OrbitDBIdentityMetadataRepository],
    [IdentityPresenceRepository, MongoIdentityPresenceRepository],
    [IdentityRepository, IpfsIdentityRepository],
    [
      IPFSContentReplicaClaimRepository,
      OrbitDBIPFSContentReplicaClaimRepository,
    ],
    [IPFSContentReplicationRepository, OrbitDBIPFSContentReplicationRepository],
    [
      IPFSReplicationStatusSummaryRepository,
      MongoIPFSReplicationStatusSummaryRepository,
    ],
    [KeychainMetadataRepository, OrbitDBKeychainMetadataRepository],
    [KeychainRepository, IpfsKeychainRepository],
    [MessageReactionRepository, OrbitDBMessageReactionRepository],
    [NodePeerRepository, MongoNodePeerRepository],
    [NodeRepository, MongoNodeMetadataRepository],
    [
      NotificationScopeSettingsRepository,
      MongoNotificationScopeSettingsRepository,
    ],
    [NotificationRepository, OrbitDBNotificationRepository],
    [PollRepository, MongoPollRepository],
    [PushNotificationDelivery, WebPushNotificationDelivery],
    [PushSubscriptionRepository, MongoPushSubscriptionRepository],
    [PushVapidConfigurationReader, PushVapidConfiguration],
    [DomainEventConsumer, MessageBus],
    [DomainEventPublisher, MessageBus],
    [PubSubTransport, Libp2pGossipsubTransport],
  ]);

  private readonly explicitServices: Array<[ExplicitServiceClass, string]> = [
    [
      MongoDB,
      path.join(
        Kernel.sourceDirectory,
        'shared/infrastructure/mongodb/MongoDB.ts',
      ),
    ],
    [
      IPFSContentRacer,
      path.join(
        Kernel.sourceDirectory,
        'contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer.ts',
      ),
    ],
  ];

  constructor() {
    this.container = new ContainerBuilder(false, Kernel.sourceDirectory);
  }

  private async ensureFolderExists(directoryPath: string): Promise<void> {
    const directoryPathWithoutFilename = path.dirname(directoryPath);
    try {
      const stat = await fs.stat(directoryPathWithoutFilename);

      if (!stat) {
        await fs.mkdir(directoryPathWithoutFilename, { recursive: true });
      }
    } catch (error) {
      return;
    }
  }

  private serviceIdFromSource(sourcePath: string, serviceName: string): string {
    const readableId = sourcePath
      .replace(/\//g, '__')
      .replace('.ts', '')
      .replace('@', '__')
      .concat(`__${serviceName}`);

    return Buffer.from(readableId, 'utf-8').toString('base64');
  }

  private registerExplicitServices(): void {
    for (const [serviceClass, sourcePath] of this.explicitServices) {
      const serviceId = this.serviceIdFromSource(sourcePath, serviceClass.name);

      if (!this.container.has(serviceId)) {
        this.container.register(serviceId, serviceClass);
      }
    }
  }

  private containerDefinitions(): Array<[string, ContainerDefinition]> {
    const definitions = (
      this.container as unknown as {
        readonly definitions:
          | Map<string, ContainerDefinition>
          | Record<string, ContainerDefinition>;
      }
    ).definitions;

    if (definitions instanceof Map) {
      return Array.from(definitions.entries());
    }

    return Object.entries(definitions);
  }

  private serviceIdFor(serviceClass: unknown): unknown {
    if (typeof serviceClass !== 'function') {
      return serviceClass;
    }

    const exactDefinition = this.containerDefinitions().find(
      ([, definition]) => definition.Object === serviceClass,
    );

    if (exactDefinition) {
      return exactDefinition[0];
    }

    const namedDefinition = this.containerDefinitions().find(
      ([, definition]) => definition.Object?.name === serviceClass.name,
    );

    return namedDefinition ? namedDefinition[0] : serviceClass;
  }

  private registerAliases(): void {
    for (const [alias, implementation] of this.aliases) {
      const aliasId = this.serviceIdFor(alias);
      const implementationId = this.serviceIdFor(implementation);

      if (typeof aliasId === 'string' && typeof implementationId === 'string') {
        this.container.setAlias(aliasId, implementationId);
      }
    }
  }

  public async compile(): Promise<void> {
    if (process.env.CONTAINER_BUILD === 'true') {
      await this.ensureFolderExists(this._servicesYamlPath);
      this.autowire = new Autowire(this.container);
      this.autowire.serviceFile = new ServiceFile(
        this._servicesYamlPath,
        false,
      );
      await this.autowire.process();
    } else {
      this.loader = new YamlFileLoader(this.container);
      await this.loader.load(this._servicesYamlPath);
    }
    this.registerExplicitServices();
    this.registerAliases();
    await this.container.compile();
  }

  public static get instance(): DependencyInjection {
    return (
      DependencyInjection._instance ||
      (DependencyInjection._instance = new this())
    );
  }

  public getService<T>(serviceName: unknown): T {
    return this.container.get<T>(
      this.serviceIdFor(this.aliases.get(serviceName) ?? serviceName),
    );
  }
}
