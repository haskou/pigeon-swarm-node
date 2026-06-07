import type { Libp2pPrivateKeyLike } from '../networks/adapters/Libp2pKeyAdapter';

export type IPFSOptions = {
  announceMultiaddrs?: string[];
  listenMultiaddrs?: string[];
  storageLocation: 'memory' | string;
  privateKey?: Libp2pPrivateKeyLike;
};
