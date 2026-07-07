import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';

export type RegisteredOrbitDBNetwork = {
  localPeerId: string;
  stores: OrbitDBPrivateNetworkStores;
};
