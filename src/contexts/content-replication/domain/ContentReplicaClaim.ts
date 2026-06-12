import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

export class ContentReplicaClaim {
  public static create(
    cid: IPFSId,
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
      new IPFSId(primitives.cid),
      new NetworkId(primitives.networkId),
      new NodeId(primitives.nodeId),
      new Timestamp(primitives.claimedAt),
    );
  }

  constructor(
    private readonly cid: IPFSId,
    private readonly networkId: NetworkId,
    private readonly nodeId: NodeId,
    private readonly claimedAt: Timestamp,
  ) {}

  public getCid(): IPFSId {
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
