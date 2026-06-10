import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSContentReplicaClaim } from '../IPFSContentReplicaClaim';

export default abstract class IPFSContentReplicaClaimRepository {
  public abstract findByCids(
    cids: IPFSId[],
  ): Promise<IPFSContentReplicaClaim[]>;

  public abstract save(claim: IPFSContentReplicaClaim): Promise<void>;
}
