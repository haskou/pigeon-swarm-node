import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { ContentReplicationStatusSummary } from '../ContentReplicationStatusSummary';

export default abstract class ContentReplicationStatusSummaryRepository {
  public abstract findByLocalNodeId(
    localNodeId: NodeId,
  ): Promise<ContentReplicationStatusSummary | undefined>;

  public abstract save(summary: ContentReplicationStatusSummary): Promise<void>;
}
