import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';

export type RegisteredOrbitDBNetwork = {
  localPeerId: string;
  processedEventIds: Set<string>;
  stores: OrbitDBReplicatedStateStores;
};
