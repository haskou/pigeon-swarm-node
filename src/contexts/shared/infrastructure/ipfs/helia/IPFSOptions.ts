import type { Libp2pPrivateKeyLike } from '../networks/adapters/types/Libp2pPrivateKeyLike';

export type IPFSOptions = {
  announceAddresses?: string[];
  enableRelayServer?: boolean;
  listenAddresses?: string[];
  storageLocation: 'memory' | string;
  privateKey?: Libp2pPrivateKeyLike;
  relayDataLimitBytes?: number;
};
