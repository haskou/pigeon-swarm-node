import { ContentReplicationStatusSummary } from '@app/contexts/content-replication/domain/ContentReplicationStatusSummary';

import { ContentReplicationStatusResource } from '../resources/ContentReplicationStatusResource';

export class ContentReplicationStatusViewModel {
  constructor(private readonly summary: ContentReplicationStatusSummary) {}

  public toResource(): ContentReplicationStatusResource {
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
