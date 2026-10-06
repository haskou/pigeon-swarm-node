import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { maxContentSizeBytes } from '../application/publish-content/ContentUploadLimits';
import { InvalidContentReplicationSizeError } from './errors/InvalidContentReplicationSizeError';
import { ContentId } from './value-objects/ContentId';
import { ContentReplicationContext } from './value-objects/ContentReplicationContext';
import { ContentSize } from './value-objects/ContentSize';

/**
 * The intent of one identity to keep one CID replicated in one network. It is
 * the owner's signed statement; the bytes and their type are never part of it.
 */
export class ContentReplication {
  public static create(
    cid: ContentId,
    networkId: NetworkId,
    context: ContentReplicationContext,
    sizeBytes: ContentSize,
    ownerIdentityId: IdentityId,
  ): ContentReplication {
    return new ContentReplication(
      cid,
      networkId,
      context,
      sizeBytes,
      ownerIdentityId,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<ContentReplication>,
  ): ContentReplication {
    return new ContentReplication(
      new ContentId(primitives.cid),
      new NetworkId(primitives.networkId),
      new ContentReplicationContext(primitives.context),
      new ContentSize(primitives.sizeBytes),
      new IdentityId(primitives.ownerIdentityId),
    );
  }

  /** Identifier of the replicated record: one per network and CID. */
  public static idOf(networkId: string, cid: string): string {
    return `content:${networkId}:${cid}`;
  }

  constructor(
    private readonly cid: ContentId,
    private readonly networkId: NetworkId,
    private readonly context: ContentReplicationContext,
    private readonly sizeBytes: ContentSize,
    private readonly ownerIdentityId: IdentityId,
  ) {
    assert(
      Number.isSafeInteger(sizeBytes.valueOf()) &&
        sizeBytes.valueOf() >= 1 &&
        sizeBytes.valueOf() <= maxContentSizeBytes,
      new InvalidContentReplicationSizeError(sizeBytes.valueOf()),
    );
  }

  public getCid(): ContentId {
    return this.cid;
  }

  public getContext(): ContentReplicationContext {
    return this.context;
  }

  public getId(): string {
    return ContentReplication.idOf(
      this.networkId.valueOf(),
      this.cid.valueOf(),
    );
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getOwnerIdentityId(): IdentityId {
    return this.ownerIdentityId;
  }

  public getSizeBytes(): ContentSize {
    return this.sizeBytes;
  }

  public toPrimitives() {
    return {
      cid: this.cid.valueOf(),
      context: this.context.valueOf(),
      networkId: this.networkId.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      sizeBytes: this.sizeBytes.valueOf(),
    };
  }
}
