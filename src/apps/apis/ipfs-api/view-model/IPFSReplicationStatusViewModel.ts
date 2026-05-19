import { IPFSReplicationStatusSummary } from '@app/contexts/ipfs-replication/domain/IPFSReplicationStatusSummary';

import { IPFSReplicationStatusResource } from '../resources/IPFSReplicationStatusResource';

export class IPFSReplicationStatusViewModel {
  constructor(private readonly summary: IPFSReplicationStatusSummary) {}

  public toResource(): IPFSReplicationStatusResource {
    const primitives = this.summary.toPrimitives();

    return {
      localNodeId: primitives.localNodeId,
      summary: {
        contentCount: primitives.contentCount,
        localResponsibleCount: primitives.localResponsibleCount,
        releasableCount: primitives.releasableCount,
        totalSizeBytes: primitives.totalSizeBytes,
        updatedAt: primitives.updatedAt,
      },
    };
  }
}
