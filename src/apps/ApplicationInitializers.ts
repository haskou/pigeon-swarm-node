import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';

import { ApplicationServiceClass } from './ApplicationServiceClass';
import DiagnosticsTraceInitializer from './initializers/diagnostics/DiagnosticsTraceInitializer';
import IdentityMutationGateInitializer from './initializers/identities/IdentityMutationGateInitializer';
import KeychainMutationGateInitializer from './initializers/keychains/KeychainMutationGateInitializer';
import PublicMutationGateInitializer from './initializers/public-mutations/PublicMutationGateInitializer';

export const applicationInitializers: ApplicationServiceClass<Initializer>[] = [
  PublicMutationGateInitializer,
  KeychainMutationGateInitializer,
  IdentityMutationGateInitializer,
  DiagnosticsTraceInitializer,
];
