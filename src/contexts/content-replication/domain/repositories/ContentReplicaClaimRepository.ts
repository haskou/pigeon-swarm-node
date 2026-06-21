import { ContentReplicaClaim } from '../ContentReplicaClaim';
import { ContentId } from '../value-objects/ContentId';

export default abstract class ContentReplicaClaimRepository {
  public abstract findByCids(cids: ContentId[]): Promise<ContentReplicaClaim[]>;

  public abstract save(claim: ContentReplicaClaim): Promise<void>;
}
