import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import IdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import KeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import NodeStartupSyncPolicy from './NodeStartupSyncPolicy';
import NodeStartupSyncReadiness from './NodeStartupSyncReadiness';

export interface NodeStartupSynchronizerDependencies {
  communityRepository: MongoCommunityRepository;
  conversationRepository: ConversationRepository;
  eventPublisher: DomainEventPublisher;
  identityMetadataRepository: IdentityMetadataRepository;
  keychainMetadataRepository: KeychainMetadataRepository;
  nodeLoader: NodeLoader;
  policy?: NodeStartupSyncPolicy;
  readiness: NodeStartupSyncReadiness;
}
