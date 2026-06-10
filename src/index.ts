/* eslint-disable no-console */
import 'module-alias/register';
import 'reflect-metadata';
import CallSignalRateLimiter from '@app/apps/apis/calls-api/CallSignalRateLimiter';
import { LinkPreviewCacheRepository } from '@app/apps/apis/link-previews-api/services/LinkPreviewCacheRepository';
import LinkPreviewFetcher from '@app/apps/apis/link-previews-api/services/LinkPreviewFetcher';
import { LinkPreviewHtmlParser } from '@app/apps/apis/link-previews-api/services/LinkPreviewHtmlParser';
import { LinkPreviewHttpFetcher } from '@app/apps/apis/link-previews-api/services/LinkPreviewHttpFetcher';
import { LinkPreviewRateLimiter } from '@app/apps/apis/link-previews-api/services/LinkPreviewRateLimiter';
import { LinkPreviewUrlGuard } from '@app/apps/apis/link-previews-api/services/LinkPreviewUrlGuard';
import { applicationConsumers } from '@app/apps/ApplicationConsumers';
import { applicationInitializers } from '@app/apps/ApplicationInitializers';
import {
  applicationRuntimes,
  startupSyncRuntimes,
} from '@app/apps/ApplicationRuntimes';
import {
  recurringSchedulers,
  startupSchedulers,
} from '@app/apps/ApplicationSchedulers';
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
import NodeNetworkDataCleaner from '@app/contexts/nodes/domain/services/NodeNetworkDataCleaner';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodeNetworkDataCleaner from '@app/contexts/nodes/infrastructure/mongo/MongoNodeNetworkDataCleaner';
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
import StickerAdder from '@app/contexts/stickers/application/add-sticker/StickerAdder';
import StickerPackCreator from '@app/contexts/stickers/application/create-pack/StickerPackCreator';
import StickerFavoriter from '@app/contexts/stickers/application/favorite-sticker/StickerFavoriter';
import StickerUserLibraryFinder from '@app/contexts/stickers/application/find-library/StickerUserLibraryFinder';
import StickerPackForgetter from '@app/contexts/stickers/application/forget-pack/StickerPackForgetter';
import StickerUseRecorder from '@app/contexts/stickers/application/record-sticker-use/StickerUseRecorder';
import StickerPackSaver from '@app/contexts/stickers/application/save-pack/StickerPackSaver';
import StickerUnfavoriter from '@app/contexts/stickers/application/unfavorite-sticker/StickerUnfavoriter';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import MongoStickerPackRepository from '@app/contexts/stickers/infrastructure/mongo/MongoStickerPackRepository';
import MongoStickerUserLibraryRepository from '@app/contexts/stickers/infrastructure/mongo/MongoStickerUserLibraryRepository';
import Kernel from '@app/Kernel';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Libp2pGossipsubTransport from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubTransport';
import PubSubTransport from '@app/shared/infrastructure/pubsub/PubSubTransport';
import path from 'path';

export const dependencyAliases = [
  [CallRepository, MongoCallRepository],
  [CommunityRepository, OrbitDBCommunityRepository],
  [CommunityChannelDraftRepository, MongoCommunityChannelDraftRepository],
  [
    CommunityChannelMessagePinRepository,
    MongoCommunityChannelMessagePinRepository,
  ],
  [CommunityChannelMessageRepository, OrbitDBCommunityChannelMessageRepository],
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
  [IPFSContentReplicaClaimRepository, OrbitDBIPFSContentReplicaClaimRepository],
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
  [NodeNetworkDataCleaner, MongoNodeNetworkDataCleaner],
  [
    NotificationScopeSettingsRepository,
    MongoNotificationScopeSettingsRepository,
  ],
  [NotificationRepository, OrbitDBNotificationRepository],
  [PollRepository, MongoPollRepository],
  [PushNotificationDelivery, WebPushNotificationDelivery],
  [PushSubscriptionRepository, MongoPushSubscriptionRepository],
  [PushVapidConfigurationReader, PushVapidConfiguration],
  [StickerPackRepository, MongoStickerPackRepository],
  [StickerUserLibraryRepository, MongoStickerUserLibraryRepository],
  [DomainEventConsumer, MessageBus],
  [DomainEventPublisher, MessageBus],
  [PubSubTransport, Libp2pGossipsubTransport],
] as const;

export const explicitServices = [
  {
    serviceClass: MongoDB,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'shared/infrastructure/mongodb/MongoDB.ts',
    ),
  },
  {
    serviceClass: IPFSContentRacer,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer.ts',
    ),
  },
  {
    dependencyClasses: [MongoDB],
    serviceClass: LinkPreviewCacheRepository,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/link-previews-api/services/LinkPreviewCacheRepository.ts',
    ),
  },
  {
    serviceClass: LinkPreviewUrlGuard,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/link-previews-api/services/LinkPreviewUrlGuard.ts',
    ),
  },
  {
    dependencyClasses: [LinkPreviewUrlGuard],
    serviceClass: LinkPreviewHttpFetcher,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/link-previews-api/services/LinkPreviewHttpFetcher.ts',
    ),
  },
  {
    serviceClass: LinkPreviewHtmlParser,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/link-previews-api/services/LinkPreviewHtmlParser.ts',
    ),
  },
  {
    dependencyClasses: [
      LinkPreviewCacheRepository,
      LinkPreviewUrlGuard,
      LinkPreviewHttpFetcher,
      LinkPreviewHtmlParser,
    ],
    serviceClass: LinkPreviewFetcher,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/link-previews-api/services/LinkPreviewFetcher.ts',
    ),
  },
  {
    dependencyClasses: [MongoDB],
    serviceClass: LinkPreviewRateLimiter,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/link-previews-api/services/LinkPreviewRateLimiter.ts',
    ),
  },
  {
    serviceClass: PushVapidConfiguration,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/push-notifications/infrastructure/web-push/PushVapidConfiguration.ts',
    ),
  },
  {
    dependencyClasses: [MongoDB],
    serviceClass: CallSignalRateLimiter,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'apps/apis/calls-api/CallSignalRateLimiter.ts',
    ),
  },
  {
    dependencyClasses: [StickerPackRepository],
    serviceClass: StickerAdder,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/add-sticker/StickerAdder.ts',
    ),
  },
  {
    dependencyClasses: [
      StickerPackRepository,
      StickerUserLibraryRepository,
      DomainEventPublisher,
    ],
    serviceClass: StickerPackCreator,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/create-pack/StickerPackCreator.ts',
    ),
  },
  {
    dependencyClasses: [StickerPackRepository, StickerUserLibraryRepository],
    serviceClass: StickerFavoriter,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/favorite-sticker/StickerFavoriter.ts',
    ),
  },
  {
    dependencyClasses: [StickerUserLibraryRepository],
    serviceClass: StickerUserLibraryFinder,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/find-library/StickerUserLibraryFinder.ts',
    ),
  },
  {
    dependencyClasses: [StickerUserLibraryRepository],
    serviceClass: StickerPackForgetter,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/forget-pack/StickerPackForgetter.ts',
    ),
  },
  {
    dependencyClasses: [StickerPackRepository, StickerUserLibraryRepository],
    serviceClass: StickerUseRecorder,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/record-sticker-use/StickerUseRecorder.ts',
    ),
  },
  {
    dependencyClasses: [
      StickerPackRepository,
      StickerUserLibraryRepository,
      DomainEventPublisher,
    ],
    serviceClass: StickerPackSaver,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/save-pack/StickerPackSaver.ts',
    ),
  },
  {
    dependencyClasses: [StickerUserLibraryRepository],
    serviceClass: StickerUnfavoriter,
    sourcePath: path.join(
      Kernel.sourceDirectory,
      'contexts/stickers/application/unfavorite-sticker/StickerUnfavoriter.ts',
    ),
  },
] as const;

async function init() {
  console.time('Kernel');
  const kernel = new Kernel();
  console.timeEnd('Kernel');

  console.time(`Environment ${process.env.NODE_ENV} variables`);
  kernel.environmentVariables();
  console.timeEnd(`Environment ${process.env.NODE_ENV} variables`);

  console.time('Dependency Injection');
  await kernel.dependencyInjection(dependencyAliases, explicitServices);
  console.timeEnd('Dependency Injection');
  kernel.configureWebSocketEventHub();

  console.time('Run server');
  await kernel.runServer();
  console.timeEnd('Run server');

  console.time('Run consumers');
  kernel.addConsumers(...applicationConsumers);
  await kernel.runInitializers(...applicationInitializers);
  await kernel.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  kernel.addSchedulers(...recurringSchedulers);
  await kernel.runSchedulers();
  console.timeEnd('Run Schedulers');

  console.time('Logs');
  kernel.logs();
  console.timeEnd('Logs');

  console.time('Load local node state');
  await kernel.loadLocalNodeState();
  console.timeEnd('Load local node state');

  console.time('Run runtimes');
  await kernel.runRuntimes(...applicationRuntimes);
  console.timeEnd('Run runtimes');

  console.time('Republish local routing records');
  for (const scheduler of startupSchedulers) {
    await kernel.runSchedulerNowAndSchedule(scheduler);
  }
  console.timeEnd('Republish local routing records');

  console.time('Node startup sync');
  await kernel.runRuntimes(...startupSyncRuntimes);
  console.timeEnd('Node startup sync');

  console.info('Ready!');
}

if (require.main === module) {
  init()
    .then(() => {
      console.info('Application started');
    })
    .catch((error) => {
      console.error('Application error', error);
    });
}
