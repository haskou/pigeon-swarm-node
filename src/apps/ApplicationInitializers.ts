import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';

import { ApplicationServiceClass } from './ApplicationServiceClass';
import CommunityReplicationInitializer from './initializers/community-replication/CommunityReplicationInitializer';

export const applicationInitializers: ApplicationServiceClass<Initializer>[] = [
  CommunityReplicationInitializer,
];
