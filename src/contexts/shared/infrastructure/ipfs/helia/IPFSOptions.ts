import type { Libp2pPrivateKeyLike } from '../networks/adapters/types/Libp2pPrivateKeyLike';

export type IPFSOptions = {
  announceAddresses?: string[];
  contentRoutingEnabled?: boolean;
  distributedHashTableEnabled?: boolean;
  distributedHashTableServerEnabled?: boolean;
  enableRelayServer?: boolean;
  listenAddresses?: string[];
  localAddressRoutingEnabled?: boolean;
  localPeerDiscoveryEnabled?: boolean;
  manualRelayMultiaddrs?: string[];
  storageLocation: 'memory' | string;
  privateKey?: Libp2pPrivateKeyLike;
  publicRelayDiscoveryEnabled?: boolean;
  relayRecordRoutingEnabled?: boolean;
  relayDataLimitBytes?: number;
};
