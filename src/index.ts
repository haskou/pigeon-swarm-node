/* eslint-disable no-console */
import 'module-alias/register';
import 'reflect-metadata';
import DeleteCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/DeleteCommunityChannelMessageWhenAnnounced';
import RegisterCommunityReactionWhenAdded from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenAdded';
import RegisterCommunityReactionWhenRemoved from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageReactionWhenRemoved';
import RegisterCommunityChannelMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import RegisterCommunityMessagesWhenSyncAvailable from '@app/apps/consumers/pubsub/communities/RegisterCommunityMessagesWhenSyncAvailable';
import RespondToCommunitySyncRequest from '@app/apps/consumers/pubsub/communities/RespondToCommunitySyncRequest';
import MarkMessagesReadWhenAnnounced from '@app/apps/consumers/pubsub/conversations/MarkMessagesReadWhenAnnounced';
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
import RegisterKeychainWhenPublished from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenPublished';
import RegisterKeychainWhenSyncAvailable from '@app/apps/consumers/pubsub/keychains/RegisterKeychainWhenSyncAvailable';
import RespondToKeychainSyncRequest from '@app/apps/consumers/pubsub/keychains/RespondToKeychainSyncRequest';
import SynchronizeKeychainWhenUpdated from '@app/apps/consumers/pubsub/keychains/SynchronizeKeychainWhenUpdated';
import RegisterNodePeerWhenHeartbeatReceived from '@app/apps/consumers/pubsub/nodes/RegisterNodePeerWhenHeartbeatReceived';
import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import IPFSReplicationMaintenanceScheduler from '@app/apps/schedulers/IPFSReplicationMaintenanceScheduler';
import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import NodeHeartbeatScheduler from '@app/apps/schedulers/NodeHeartbeatScheduler';
import { createNodeStartupSynchronizer } from '@app/apps/synchronizers/createNodeStartupSynchronizer';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import IdentityNetworkSyncResponder from '@app/contexts/identities/application/respond-network-sync/IdentityNetworkSyncResponder';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import IPFSContentReplicaClaimRegistrar from '@app/contexts/ipfs-replication/application/register-claim/IPFSContentReplicaClaimRegistrar';
import MongoIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicaClaimRepository';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

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
      communityMessageReactionRepository,
    ),
    new RegisterCommunityReactionWhenRemoved(
      messageBus,
      communityMessageReactionRepository,
    ),
    new RegisterIPFSReplicaClaimWhenClaimed(
      messageBus,
      new IPFSContentReplicaClaimRegistrar(ipfsReplicaClaimRepository),
    ),
  );
  await kernel.runConsumers();
  console.timeEnd('Run consumers');

  console.time('Run Schedulers');
  kernel.addSchedulers(NodeHeartbeatScheduler);
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

  console.time('IPFS Runtime');
  const ipfsRuntime = new IPFSRuntime();
  await ipfsRuntime.run();
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
