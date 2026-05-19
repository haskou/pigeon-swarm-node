import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { IPFSReplicationStatusSummary } from '../IPFSReplicationStatusSummary';

export interface IPFSReplicationStatusSummaryRepository {
  findByLocalNodeId(
    localNodeId: NodeId,
  ): Promise<IPFSReplicationStatusSummary | undefined>;
  save(summary: IPFSReplicationStatusSummary): Promise<void>;
}
