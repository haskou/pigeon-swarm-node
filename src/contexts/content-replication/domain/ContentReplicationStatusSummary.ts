import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Integer, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { ContentSize } from './value-objects/ContentSize';

export class ContentReplicationStatusSummary {
  public static empty(localNodeId: NodeId): ContentReplicationStatusSummary {
    return new ContentReplicationStatusSummary(
      localNodeId,
      new Integer(0),
      new ContentSize(0),
      new Integer(0),
      new Integer(0),
      new Timestamp(0),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<ContentReplicationStatusSummary>,
  ): ContentReplicationStatusSummary {
    return new ContentReplicationStatusSummary(
      new NodeId(primitives.localNodeId),
      new Integer(primitives.contentCount),
      new ContentSize(primitives.totalSizeBytes),
      new Integer(primitives.localResponsibleCount),
      new Integer(primitives.releasableCount),
      new Timestamp(primitives.updatedAt),
    );
  }

  constructor(
    private readonly localNodeId: NodeId,
    private readonly contentCount: Integer,
    private readonly totalSizeBytes: ContentSize,
    private readonly localResponsibleCount: Integer,
    private readonly releasableCount: Integer,
    private readonly updatedAt: Timestamp,
  ) {}

  public getLocalNodeId(): NodeId {
    return this.localNodeId;
  }

  public toPrimitives() {
    return {
      contentCount: this.contentCount.valueOf(),
      localNodeId: this.localNodeId.valueOf(),
      localResponsibleCount: this.localResponsibleCount.valueOf(),
      releasableCount: this.releasableCount.valueOf(),
      totalSizeBytes: this.totalSizeBytes.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
