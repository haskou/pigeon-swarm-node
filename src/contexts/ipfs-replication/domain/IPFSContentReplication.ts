import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { IPFSId } from '../../shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSContentReplicationContext } from './value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationPriority } from './value-objects/IPFSContentReplicationPriority';
import { IPFSContentSize } from './value-objects/IPFSContentSize';

export class IPFSContentReplication {
  private updatedAt: Timestamp;

  public static create(
    cid: IPFSId,
    context: IPFSContentReplicationContext,
    networkIds: NetworkId[],
    sizeBytes: IPFSContentSize,
    ownerIdentityId: IdentityId | undefined,
    priority: IPFSContentReplicationPriority,
    createdAt: Timestamp = Timestamp.now(),
  ): IPFSContentReplication {
    return new IPFSContentReplication(
      cid,
      context,
      networkIds,
      sizeBytes,
      ownerIdentityId,
      priority,
      createdAt,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<IPFSContentReplication>,
  ): IPFSContentReplication {
    return new IPFSContentReplication(
      new IPFSId(primitives.cid),
      new IPFSContentReplicationContext(primitives.context),
      primitives.networkIds.map((networkId) => new NetworkId(networkId)),
      new IPFSContentSize(primitives.sizeBytes),
      primitives.ownerIdentityId
        ? new IdentityId(primitives.ownerIdentityId)
        : undefined,
      new IPFSContentReplicationPriority(primitives.priority),
      new Timestamp(primitives.createdAt),
    ).withUpdatedAt(new Timestamp(primitives.updatedAt));
  }

  constructor(
    private readonly cid: IPFSId,
    private readonly context: IPFSContentReplicationContext,
    private readonly networkIds: NetworkId[],
    private readonly sizeBytes: IPFSContentSize,
    private readonly ownerIdentityId: IdentityId | undefined,
    private readonly priority: IPFSContentReplicationPriority,
    private readonly createdAt: Timestamp,
  ) {
    this.updatedAt = createdAt;
  }

  private withUpdatedAt(updatedAt: Timestamp): IPFSContentReplication {
    this.updatedAt = updatedAt;

    return this;
  }

  public getCid(): IPFSId {
    return this.cid;
  }

  public getNetworkIds(): NetworkId[] {
    return this.networkIds;
  }

  public addNetworkIds(networkIds: NetworkId[]): void {
    for (const networkId of networkIds) {
      const alreadyRegistered = this.networkIds.some((registeredNetworkId) =>
        registeredNetworkId.isEqual(networkId),
      );

      if (!alreadyRegistered) {
        this.networkIds.push(networkId);
      }
    }
  }

  public touch(updatedAt: Timestamp = Timestamp.now()): void {
    this.updatedAt = updatedAt;
  }

  public toPrimitives() {
    return {
      cid: this.cid.valueOf(),
      context: this.context.valueOf(),
      createdAt: this.createdAt.valueOf(),
      networkIds: this.networkIds.map((networkId) => networkId.valueOf()),
      ownerIdentityId: this.ownerIdentityId?.valueOf(),
      priority: this.priority.valueOf(),
      sizeBytes: this.sizeBytes.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
