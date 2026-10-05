import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';

import { ApplicationServiceClass } from './ApplicationServiceClass';
import PublicMutationGateInitializer from './initializers/public-mutations/PublicMutationGateInitializer';

export const applicationInitializers: ApplicationServiceClass<Initializer>[] = [
  PublicMutationGateInitializer,
];
