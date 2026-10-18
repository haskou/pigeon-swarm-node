import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';

import { ApplicationServiceClass } from './ApplicationServiceClass';
import ConversationDraftsPurgeInitializer from './initializers/conversations/ConversationDraftsPurgeInitializer';
import DiagnosticsTraceInitializer from './initializers/diagnostics/DiagnosticsTraceInitializer';
import IdentityMutationGateInitializer from './initializers/identities/IdentityMutationGateInitializer';
import KeychainMutationGateInitializer from './initializers/keychains/KeychainMutationGateInitializer';
import NodeBlockPolicyInitializer from './initializers/nodes/NodeBlockPolicyInitializer';
import NonCanonicalIdentityIdsPurgeInitializer from './initializers/nodes/NonCanonicalIdentityIdsPurgeInitializer';
import PrivateBlobStorageInitializer from './initializers/private-blobs/PrivateBlobStorageInitializer';
import PublicMutationGateInitializer from './initializers/public-mutations/PublicMutationGateInitializer';

export const applicationInitializers: ApplicationServiceClass<Initializer>[] = [
  NonCanonicalIdentityIdsPurgeInitializer,
  PrivateBlobStorageInitializer,
  NodeBlockPolicyInitializer,
  PublicMutationGateInitializer,
  KeychainMutationGateInitializer,
  IdentityMutationGateInitializer,
  DiagnosticsTraceInitializer,
  ConversationDraftsPurgeInitializer,
];
