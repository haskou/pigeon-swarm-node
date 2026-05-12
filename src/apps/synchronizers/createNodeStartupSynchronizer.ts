import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import MongoKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';

import NodeStartupSynchronizer from './NodeStartupSynchronizer';

export function createNodeStartupSynchronizer(): NodeStartupSynchronizer {
  return new NodeStartupSynchronizer(
    Kernel.di.getService<NodeLoader>(NodeLoader),
    Kernel.di.getService<NodeHeartbeatSender>(NodeHeartbeatSender),
    Kernel.di.getService<MongoIdentityMetadataRepository>(
      MongoIdentityMetadataRepository,
    ),
    Kernel.di.getService<MongoKeychainMetadataRepository>(
      MongoKeychainMetadataRepository,
    ),
    Kernel.di.getService<MongoConversationRepository>(
      MongoConversationRepository,
    ),
    Kernel.di.getService<MessageBus>(MessageBus),
  );
}
