import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSContentReplication } from '../IPFSContentReplication';

export interface IPFSContentReplicationRepository {
  findAll(): Promise<IPFSContentReplication[]>;
  findByCid(cid: IPFSId): Promise<IPFSContentReplication | undefined>;
  findByNetworkId(
    networkId: NetworkId,
    limit?: number,
  ): Promise<IPFSContentReplication[]>;
  save(content: IPFSContentReplication): Promise<void>;
}
