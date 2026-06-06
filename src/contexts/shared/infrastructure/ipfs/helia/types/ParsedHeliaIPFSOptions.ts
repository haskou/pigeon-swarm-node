import { Libp2pPrivateKeyLike } from '../../networks/adapters/Libp2pKeyAdapter';
import { Libp2pDefaults } from '../adapters/types/Libp2pDefaults';
import { RuntimeBlockstore } from '../adapters/types/RuntimeBlockstore';
import { RuntimeDatastore } from '../adapters/types/RuntimeDatastore';
import { ConnectionGater } from './ConnectionGater';

export type ParsedHeliaIPFSOptions = {
  blockstore: RuntimeBlockstore;
  datastore: RuntimeDatastore;
  libp2p: Libp2pDefaults & {
    connectionGater: ConnectionGater;
    privateKey?: Libp2pPrivateKeyLike;
  };
};
