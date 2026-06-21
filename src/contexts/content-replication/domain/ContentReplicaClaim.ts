import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { ContentId } from './value-objects/ContentId';

export class ContentReplicaClaim {
  public static create(
    cid: ContentId,
    networkId: NetworkId,
    nodeId: NodeId,
    claimedAt: Timestamp = Timestamp.now(),
  ): ContentReplicaClaim {
    return new ContentReplicaClaim(cid, networkId, nodeId, claimedAt);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<ContentReplicaClaim>,
  ): ContentReplicaClaim {
    return new ContentReplicaClaim(
      new ContentId(primitives.cid),
      new NetworkId(primitives.networkId),
      new NodeId(primitives.nodeId),
      new Timestamp(primitives.claimedAt),
    );
  }

  constructor(
    private readonly cid: ContentId,
    private readonly networkId: NetworkId,
    private readonly nodeId: NodeId,
    private readonly claimedAt: Timestamp,
  ) {}

  public getCid(): ContentId {
    return this.cid;
  }

  public toPrimitives() {
    return {
      cid: this.cid.valueOf(),
      claimedAt: this.claimedAt.valueOf(),
      networkId: this.networkId.valueOf(),
      nodeId: this.nodeId.valueOf(),
    };
  }
}
