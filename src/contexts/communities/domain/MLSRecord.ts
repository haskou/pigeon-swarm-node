import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityId } from './value-objects/CommunityId';
import { MLSRecordId } from './value-objects/MLSRecordId';
import { MLSRecordKind } from './value-objects/MLSRecordKind';

/** Opaque, immutable record of a community MLS group; the node never parses `payload`. */
export class MLSRecord {
  constructor(
    public readonly id: MLSRecordId,
    public readonly communityId: CommunityId,
    public readonly groupId: string,
    public readonly kind: MLSRecordKind,
    public readonly payload: string,
    public readonly authorIdentityId: IdentityId,
    public readonly createdAt: Timestamp,
    public readonly epoch?: number,
    public readonly recipientIdentityId?: IdentityId,
  ) {}

  public isAddressedTo(identityId: IdentityId): boolean {
    return (
      !this.recipientIdentityId || this.recipientIdentityId.isEqual(identityId)
    );
  }

  /** The groupId is the community id or `communityId:channelId`. */
  public channelId(): string | undefined {
    const [, channelId] = this.groupId.split(':');

    return channelId;
  }
}
