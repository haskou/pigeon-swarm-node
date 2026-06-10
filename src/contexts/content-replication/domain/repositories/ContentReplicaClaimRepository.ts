import { IPFSId } from '../../../shared/infrastructure/ipfs/helia/IPFSId';
import { ContentReplicaClaim } from '../ContentReplicaClaim';

export default abstract class ContentReplicaClaimRepository {
  public abstract findByCids(cids: IPFSId[]): Promise<ContentReplicaClaim[]>;

  public abstract save(claim: ContentReplicaClaim): Promise<void>;
}
