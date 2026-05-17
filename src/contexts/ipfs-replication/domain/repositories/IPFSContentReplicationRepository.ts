import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSContentReplication } from '../IPFSContentReplication';

export interface IPFSContentReplicationRepository {
  findAll(): Promise<IPFSContentReplication[]>;
  findByCid(cid: IPFSId): Promise<IPFSContentReplication | undefined>;
  save(content: IPFSContentReplication): Promise<void>;
}
