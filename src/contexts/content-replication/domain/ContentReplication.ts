import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { ContentFilename } from './value-objects/ContentFilename';
import { ContentId } from './value-objects/ContentId';
import { ContentReplicationContext } from './value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from './value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from './value-objects/ContentReplicationPriority';
import { ContentType } from './value-objects/ContentType';

export class ContentReplication {
  private updatedAt: Timestamp;

  public static create(
    cid: ContentId,
    context: ContentReplicationContext,
    networkIds: NetworkId[],
    metadata: ContentReplicationMetadata,
    ownerIdentityId: IdentityId | undefined,
    priority: ContentReplicationPriority,
    createdAt: Timestamp = Timestamp.now(),
  ): ContentReplication {
    return new ContentReplication(
      cid,
      context,
      networkIds,
      metadata,
      ownerIdentityId,
      priority,
      createdAt,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<ContentReplication>,
  ): ContentReplication {
    return new ContentReplication(
      new ContentId(primitives.cid),
      new ContentReplicationContext(primitives.context),
      primitives.networkIds.map((networkId) => new NetworkId(networkId)),
      ContentReplicationMetadata.fromPrimitives(
        primitives.sizeBytes,
        primitives.contentType,
        primitives.filename,
      ),
      primitives.ownerIdentityId
        ? new IdentityId(primitives.ownerIdentityId)
        : undefined,
      new ContentReplicationPriority(primitives.priority),
      new Timestamp(primitives.createdAt),
    ).withUpdatedAt(new Timestamp(primitives.updatedAt));
  }

  constructor(
    private readonly cid: ContentId,
    private readonly context: ContentReplicationContext,
    private readonly networkIds: NetworkId[],
    private metadata: ContentReplicationMetadata,
    private readonly ownerIdentityId: IdentityId | undefined,
    private readonly priority: ContentReplicationPriority,
    private readonly createdAt: Timestamp,
  ) {
    this.updatedAt = createdAt;
  }

  private withUpdatedAt(updatedAt: Timestamp): ContentReplication {
    this.updatedAt = updatedAt;

    return this;
  }

  public getCid(): ContentId {
    return this.cid;
  }

  public getNetworkIds(): NetworkId[] {
    return [...this.networkIds];
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

  public getContentType(): ContentType {
    return this.metadata.getContentType();
  }

  public getFilename(): ContentFilename | undefined {
    return this.metadata.getFilename();
  }

  public updateMetadata(metadata: ContentReplicationMetadata): void {
    this.metadata = metadata;
  }

  public touch(updatedAt: Timestamp = Timestamp.now()): void {
    this.updatedAt = updatedAt;
  }

  public toPrimitives() {
    return {
      cid: this.cid.valueOf(),
      contentType: this.metadata.getContentType().valueOf(),
      context: this.context.valueOf(),
      createdAt: this.createdAt.valueOf(),
      filename: this.metadata.getFilename()?.valueOf(),
      networkIds: this.networkIds.map((networkId) => networkId.valueOf()),
      ownerIdentityId: this.ownerIdentityId?.valueOf(),
      priority: this.priority.valueOf(),
      sizeBytes: this.metadata.getSizeBytes().valueOf(),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
