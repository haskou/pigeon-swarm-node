import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Integer, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IPFSContentSize } from './value-objects/IPFSContentSize';

export class IPFSReplicationStatusSummary {
  public static empty(localNodeId: NodeId): IPFSReplicationStatusSummary {
    return new IPFSReplicationStatusSummary(
      localNodeId,
      new Integer(0),
      new IPFSContentSize(0),
      new Integer(0),
      new Integer(0),
      new Timestamp(0),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<IPFSReplicationStatusSummary>,
  ): IPFSReplicationStatusSummary {
    return new IPFSReplicationStatusSummary(
      new NodeId(primitives.localNodeId),
      new Integer(primitives.contentCount),
      new IPFSContentSize(primitives.totalSizeBytes),
      new Integer(primitives.localResponsibleCount),
      new Integer(primitives.releasableCount),
      new Timestamp(primitives.updatedAt),
    );
  }

  constructor(
    private readonly localNodeId: NodeId,
    private readonly contentCount: Integer,
    private readonly totalSizeBytes: IPFSContentSize,
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
