import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { IPFSReplicationStatusSummary } from '../IPFSReplicationStatusSummary';

export default abstract class IPFSReplicationStatusSummaryRepository {
  public abstract findByLocalNodeId(
    localNodeId: NodeId,
  ): Promise<IPFSReplicationStatusSummary | undefined>;

  public abstract save(summary: IPFSReplicationStatusSummary): Promise<void>;
}
