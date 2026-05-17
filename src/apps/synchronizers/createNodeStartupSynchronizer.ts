import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import MongoKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import NodeStartupSynchronizer from './NodeStartupSynchronizer';
import NodeStartupSyncReadiness from './NodeStartupSyncReadiness';

export function createNodeStartupSynchronizer(): NodeStartupSynchronizer {
  const mongo = Kernel.di.getService<MongoDB>(MongoDB);

  return new NodeStartupSynchronizer(
    Kernel.di.getService<NodeLoader>(NodeLoader),
    new NodeStartupSyncReadiness(
      Kernel.di.getService<NodeHeartbeatSender>(NodeHeartbeatSender),
      Kernel.di.getService<IPFS>(IPFS),
    ),
    Kernel.di.getService<MongoIdentityMetadataRepository>(
      MongoIdentityMetadataRepository,
    ),
    Kernel.di.getService<MongoKeychainMetadataRepository>(
      MongoKeychainMetadataRepository,
    ),
    Kernel.di.getService<MongoConversationRepository>(
      MongoConversationRepository,
    ),
    new MongoCommunityRepository(mongo),
    Kernel.di.getService<MessageBus>(MessageBus),
  );
}
