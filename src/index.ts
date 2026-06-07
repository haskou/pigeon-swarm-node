/* eslint-disable no-console */
import 'module-alias/register';
import 'reflect-metadata';
import DeleteCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/DeleteCommunityChannelMessageWhenAnnounced';
import RegisterCommunityChannelMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import RegisterCommunityMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/communities/RegisterCommunityMessagesWhenSyncAvailable';
import RespondToCommunitySyncRequest from '@app/apps/consumers/pubsub/communities/RespondToCommunitySyncRequest';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
import RegisterConversationWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterConversationWhenAnnounced';
import RegisterMessageDeletionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageDeletionWhenAnnounced';
import RegisterMessageEditionWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageEditionWhenAnnounced';
import RegisterMessageReactionWhenAdded from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenAdded';
import RegisterMessageReactionWhenRemoved from '@app/apps/consumers/pubsub/conversations/RegisterMessageReactionWhenRemoved';
import RegisterMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/conversations/RegisterMessagesWhenSyncAvailable';
import RegisterMessageWhenAnnounced from '@app/apps/consumers/pubsub/conversations/RegisterMessageWhenAnnounced';
import RespondToConversationSyncRequest from '@app/apps/consumers/pubsub/conversations/RespondToConversationSyncRequest';
import RegisterIdentityWhenPublished from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenPublished';
import RegisterIdentityWhenSyncAvailable from '@app/apps/consumers/pubsub/identities/RegisterIdentityWhenSyncAvailable';
import RespondToIdentityNetworkSyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentityNetworkSyncRequest';
import RespondToIdentitySyncRequest from '@app/apps/consumers/pubsub/identities/RespondToIdentitySyncRequest';
import SynchronizeIdentityWhenUpdated from '@app/apps/consumers/pubsub/identities/SynchronizeIdentityWhenUpdated';
import RegisterIPFSReplicaClaimWhenClaimed from '@app/apps/consumers/pubsub/ipfs/RegisterIPFSContentReplicaClaimWhenClaimed';
import RegisterIPFSContentReplicationWhenRegistered from '@app/apps/consumers/pubsub/ipfs/RegisterIPFSContentReplicationWhenRegistered';
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import RegisterIdentityPresenceWhenUpdated from '@app/apps/consumers/pubsub/presence/RegisterIdentityPresenceWhenUpdated';
import SendPushNotificationWhenEventReceived from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenEventReceived';
import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import IdentityPresenceExpirationScheduler from '@app/apps/schedulers/IdentityPresenceExpirationScheduler';
import IPFSReplicationMaintenanceScheduler from '@app/apps/schedulers/IPFSReplicationMaintenanceScheduler';
import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import { createNodeStartupSynchronizer } from '@app/apps/synchronizers/createNodeStartupSynchronizer';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import IdentityNetworkSyncResponder from '@app/contexts/identities/application/respond-network-sync/IdentityNetworkSyncResponder';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import IPFSReplicationStatusSummaryRefresher from '@app/contexts/ipfs-replication/application/refresh-status-summary/IPFSReplicationStatusSummaryRefresher';
import IPFSContentReplicaClaimRegistrar from '@app/contexts/ipfs-replication/application/register-claim/IPFSContentReplicaClaimRegistrar';
import IPFSContentReplicationMetadataRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationMetadataRegistrar';
import IPFSReplicationStatusSummaryUpdater from '@app/contexts/ipfs-replication/application/update-status-summary/IPFSReplicationStatusSummaryUpdater';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import MongoIPFSReplicationStatusSummaryRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSReplicationStatusSummaryRepository';
import MongoNodeMetadataRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodeMetadataRepository';
import MongoNodePeerRepository from '@app/contexts/nodes/infrastructure/mongo/MongoNodePeerRepository';
import { NotificationDeliveryPreferenceChecker } from '@app/contexts/notification-settings/application/should-deliver/NotificationDeliveryPreferenceChecker';
import { MongoNotificationScopeSettingsRepository } from '@app/contexts/notification-settings/infrastructure/mongo/MongoNotificationScopeSettingsRepository';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import MongoIdentityPresenceRepository from '@app/contexts/presence/infrastructure/mongo/MongoIdentityPresenceRepository';
import { PushNotificationDispatcher } from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { MongoPushSubscriptionRepository } from '@app/contexts/push-notifications/infrastructure/mongo/MongoPushSubscriptionRepository';
import { WebPushNotificationDelivery } from '@app/contexts/push-notifications/infrastructure/web-push/WebPushNotificationDelivery';
import { PublicIPFSContentFallback } from '@app/contexts/shared/infrastructure/ipfs/fallback/PublicIPFSContentFallback';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { MongoIndexInitializer } from '@app/shared/infrastructure/mongodb/MongoIndexInitializer';
import { MongoPublicRelayRecordRepository } from '@app/shared/infrastructure/network/relay/MongoPublicRelayRecordRepository';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRuntime } from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

import { IPFSRuntime } from './apps/runtimes/ipfs-runtime/IPFSRuntime';

async function init() {
  console.time('Kernel');
  const kernel = new Kernel();
  console.timeEnd('Kernel');

  console.time(`Environment ${process.env.NODE_ENV} variables`);
  kernel.environmentVariables();
  console.timeEnd(`Environment ${process.env.NODE_ENV} variables`);

  console.time('Dependency Injection');
  await kernel.dependencyInjection();
  console.timeEnd('Dependency Injection');

  console.time('Run server');
  await kernel.runServer();
  console.timeEnd('Run server');

  console.time('Run consumers');
  kernel.addConsumers(
    RegisterIdentityWhenPublished,
    SynchronizeIdentityWhenUpdated,
    RespondToIdentitySyncRequest,
    RegisterIdentityWhenSyncAvailable,
    RegisterKeychainWhenPublished,
    SynchronizeKeychainWhenUpdated,
    RespondToKeychainSyncRequest,
    RegisterKeychainWhenSyncAvailable,
    RegisterConversationWhenAnnounced,
    RegisterMessageWhenAnnounced,
    RegisterMessageEditionWhenAnnounced,
    RegisterMessageDeletionWhenAnnounced,
    RegisterMessageReactionWhenAdded,
    RegisterMessageReactionWhenRemoved,
    RespondToConversationSyncRequest,
    RegisterMessagesWhenSyncAvailable,
    RegisterNodePeerWhenHeartbeatReceived,
  );
  const messageBus = Kernel.di.getService<MessageBus>(MessageBus);
  const conversationRepository =
    Kernel.di.getService<MongoConversationRepository>(
      MongoConversationRepository,
    );
  const mongo = Kernel.di.getService<MongoDB>(MongoDB);
  await new MongoIndexInitializer(mongo).ensure();
  const publicRelayRecordRepository = new MongoPublicRelayRecordRepository(
    mongo,
  );
  const publicRelayRecordRegistry = new PublicRelayRecordRegistry();

  publicRelayRecordRegistry.onRecordSaved((record) =>
    publicRelayRecordRepository.save(record),
  );
  await publicRelayRecordRepository.deleteExpired();
  (await publicRelayRecordRepository.findActive()).forEach((record) => {
    publicRelayRecordRegistry.save(record);
  });
  const identityMetadataRepository =
    Kernel.di.getService<MongoIdentityMetadataRepository>(
      MongoIdentityMetadataRepository,
    );
  const communityRepository = new MongoCommunityRepository(mongo);
  const communityMessageRepository = new MongoCommunityChannelMessageRepository(
    mongo,
  );
  const communityMessageReactionRepository =
    new MongoCommunityMessageReactionRepository(mongo);
  const ipfsReplicaClaimRepository = new MongoIPFSContentReplicaClaimRepository(
    mongo,
  );
  const ipfsContentReplicationRepository =
    new MongoIPFSContentReplicationRepository(mongo);
  const ipfsReplicationSummaryRepository =
    new MongoIPFSReplicationStatusSummaryRepository(mongo);
  const ipfsReplicationSummaryRefresher =
    new IPFSReplicationStatusSummaryRefresher(
      new IPFSReplicationStatusFinder(
        ipfsContentReplicationRepository,
        ipfsReplicaClaimRepository,
        Kernel.di.getService<MongoNodeMetadataRepository>(
          MongoNodeMetadataRepository,
        ),
        new MongoNodePeerRepository(mongo),
      ),
      new IPFSReplicationStatusSummaryUpdater(ipfsReplicationSummaryRepository),
    );
  const pushNotificationDispatcher = new PushNotificationDispatcher(
    new MongoPushSubscriptionRepository(mongo),
    new MongoIdentityPresenceRepository(mongo),
    conversationRepository,
    new WebPushNotificationDelivery(),
    new NotificationDeliveryPreferenceChecker(
      new MongoNotificationScopeSettingsRepository(mongo),
    ),
  );

  kernel.addConsumerInstances(
    new MarkMessagesReadWhenAnnounced(
      messageBus,
      new MessagesReadRegistrar(conversationRepository),
    ),
    new RespondToIdentityNetworkSyncRequest(
      messageBus,
      new IdentityNetworkSyncResponder(identityMetadataRepository, messageBus),
    ),
    new RegisterCommunityChannelMessageWhenAnnounced(
      messageBus,
      communityRepository,
      communityMessageRepository,
    ),
    new DeleteCommunityChannelMessageWhenAnnounced(
      messageBus,
      communityRepository,
      communityMessageRepository,
    ),
    new RegisterCommunityChannelMessageEditionWhenAnnounced(
      messageBus,
      communityRepository,
      communityMessageRepository,
    ),
    new RespondToCommunitySyncRequest(
      messageBus,
      communityRepository,
      communityMessageRepository,
      communityMessageReactionRepository,
      messageBus,
    ),
    new RegisterCommunityMessagesWhenSyncAvailable(
      messageBus,
      communityRepository,
      communityMessageRepository,
      communityMessageReactionRepository,
    ),
    new RegisterCommunityReactionWhenAdded(
      messageBus,
      communityRepository,
      communityMessageRepository,
      communityMessageReactionRepository,
    ),
    new RegisterCommunityReactionWhenRemoved(
      messageBus,
      communityRepository,
      communityMessageRepository,
      communityMessageReactionRepository,
    ),
    new RegisterIPFSReplicaClaimWhenClaimed(
      messageBus,
      new IPFSContentReplicaClaimRegistrar(
        ipfsReplicaClaimRepository,
        ipfsReplicationSummaryRefresher,
      ),
    ),
    new RegisterIPFSContentReplicationWhenRegistered(
      messageBus,
      new IPFSContentReplicationMetadataRegistrar(
        ipfsContentReplicationRepository,
        ipfsReplicationSummaryRefresher,
      ),
    ),
    new RegisterIdentityPresenceWhenUpdated(messageBus),
    new SendPushNotificationWhenEventReceived(
      messageBus,
      ConversationMessageWasSentEvent,
      ConversationMessageWasSentEvent.EVENT_NAME,
      'pigeon-swarm.send-push-when-conversation-message-sent',
      pushNotificationDispatcher,
    ),
    new SendPushNotificationWhenEventReceived(
      messageBus,
      CommunityChannelMessageWasSentEvent,
      CommunityChannelMessageWasSentEvent.EVENT_NAME,
      'pigeon-swarm.send-push-when-community-message-sent',
      pushNotificationDispatcher,
    ),
    new SendPushNotificationWhenEventReceived(
      messageBus,
      NotificationWasCreatedEvent,
      NotificationWasCreatedEvent.EVENT_NAME,
      'pigeon-swarm.send-push-when-notification-created',
      pushNotificationDispatcher,
    ),
    new SendPushNotificationWhenEventReceived(
      messageBus,
      CallStartedEvent,
      CallStartedEvent.EVENT_NAME,
      'pigeon-swarm.send-push-when-call-started',
      pushNotificationDispatcher,
    ),
    new SendPushNotificationWhenEventReceived(
      messageBus,
      ConversationMessagesWereReadEvent,
      ConversationMessagesWereReadEvent.EVENT_NAME,
      'pigeon-swarm.clear-push-when-conversation-messages-read',
      pushNotificationDispatcher,
    ),
  );
  await kernel.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  kernel.addSchedulers(NodeHeartbeatScheduler);
  kernel.addAcceptanceInstanceScheduler(
    new IdentityPresenceExpirationScheduler(),
  );
  kernel.addAcceptanceInstanceScheduler(new CallTimeoutScheduler());
  kernel.addAcceptanceInstanceScheduler(
    new IPFSReplicationMaintenanceScheduler(),
  );
  await kernel.runSchedulers();
  console.timeEnd('Run Schedulers');

  console.time('Logs');
  kernel.logs();
  console.timeEnd('Logs');

  console.time('Load local node state');
  await kernel.loadLocalNodeState();
  console.timeEnd('Load local node state');

  console.time('Public relay runtime');
  await new PublicRelayRuntime(
    Kernel.di.getService<IPFSNetworkRegistry>(IPFSNetworkRegistry),
  ).start();
  console.timeEnd('Public relay runtime');

  console.time('IPFS Runtime');
  const ipfsRuntime = new IPFSRuntime();
  await ipfsRuntime.run();
  await new PublicIPFSContentFallback().serveRegistry(
    Kernel.di.getService<IPFSNetworkRegistry>(IPFSNetworkRegistry),
  );
  console.timeEnd('IPFS Runtime');

  console.time('Republish local routing records');
  const localRoutingRecordRepublisher =
    new LocalRoutingRecordRepublisherScheduler();
  await localRoutingRecordRepublisher.execute();
  await localRoutingRecordRepublisher.init();
  console.timeEnd('Republish local routing records');

  console.time('Node startup sync');
  const nodeStartupSynchronizer = createNodeStartupSynchronizer();
  const startupSyncResult = await nodeStartupSynchronizer.synchronize();

  console.info('Node startup sync result', startupSyncResult);
  nodeStartupSynchronizer.scheduleRetries();
  console.timeEnd('Node startup sync');

  console.info('Ready!');
}

init()
  .then(() => {
    console.info('Application started');
  })
  .catch((error) => {
    console.error('Application error', error);
  });
