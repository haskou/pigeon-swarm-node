import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSContentReplication } from '../IPFSContentReplication';

export default abstract class IPFSContentReplicationRepository {
  public abstract findAll(): Promise<IPFSContentReplication[]>;
  public abstract findByCid(
    cid: IPFSId,
  ): Promise<IPFSContentReplication | undefined>;

  public abstract save(content: IPFSContentReplication): Promise<void>;
}
