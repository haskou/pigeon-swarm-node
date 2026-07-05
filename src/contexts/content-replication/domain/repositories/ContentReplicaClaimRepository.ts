import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { ContentReplicaClaim } from '../ContentReplicaClaim';
import { ContentId } from '../value-objects/ContentId';

export default abstract class ContentReplicaClaimRepository {
  public abstract findByCids(cids: ContentId[]): Promise<ContentReplicaClaim[]>;

  public abstract save(claim: ContentReplicaClaim): Promise<void>;

  public abstract withdraw(
    cid: ContentId,
    networkId: NetworkId,
    nodeId: NodeId,
  ): Promise<void>;
}
