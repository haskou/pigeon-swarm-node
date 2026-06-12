import { Libp2pPrivateKeyLike } from '../../networks/adapters/types/Libp2pPrivateKeyLike';
import { HeliaBlockBrokers } from '../adapters/types/HeliaBlockBrokers';
import { Libp2pDefaults } from '../adapters/types/Libp2pDefaults';
import { RuntimeBlockstore } from '../adapters/types/RuntimeBlockstore';
import { RuntimeDatastore } from '../adapters/types/RuntimeDatastore';
import { ConnectionGater } from './ConnectionGater';

export type ParsedHeliaIPFSOptions = {
  blockBrokers?: HeliaBlockBrokers;
  blockstore: RuntimeBlockstore;
  datastore: RuntimeDatastore;
  libp2p: Libp2pDefaults & {
    connectionGater: ConnectionGater;
    privateKey?: Libp2pPrivateKeyLike;
  };
};
