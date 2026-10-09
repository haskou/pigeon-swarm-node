import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@hasku/value-objects';

import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityId } from './value-objects/CommunityId';
import { MLSRecordId } from './value-objects/MLSRecordId';
import { MLSRecordKind } from './value-objects/MLSRecordKind';

export interface MLSRecordData {
  id: string;
  communityId: string;
  groupId: string;
  kind: string;
  epoch?: number;
  recipientIdentityId?: string;
  payload: string;
  createdAt: number;
  authorIdentityId: string;
  mutation: Record<string, unknown>;
}

export class MLSRecord {
  private constructor(
    readonly recordId: MLSRecordId,
    readonly communityId: CommunityId,
    readonly groupId: string, // "communityId" or "communityId:channelId"
    readonly kind: MLSRecordKind,
    readonly payload: string, // base64
    readonly authorIdentityId: IdentityId,
    readonly createdAt: Timestamp,
    readonly epoch?: number,
    readonly recipientIdentityId?: IdentityId,
  ) {}

  public static create(
    recordId: MLSRecordId,
    communityId: CommunityId,
    groupId: string,
    kind: MLSRecordKind,
    payload: string,
    authorIdentityId: IdentityId,
    createdAt: Timestamp,
    epoch?: number,
    recipientIdentityId?: IdentityId,
  ): MLSRecord {
    return new MLSRecord(
      recordId,
      communityId,
      groupId,
      kind,
      payload,
      authorIdentityId,
      createdAt,
      epoch,
      recipientIdentityId,
    );
  }

  public toData(): MLSRecordData {
    return {
      id: this.recordId.valueOf(),
      communityId: this.communityId.valueOf(),
      groupId: this.groupId,
      kind: this.kind.valueOf(),
      ...(this.epoch !== undefined && { epoch: this.epoch }),
      ...(this.recipientIdentityId && { recipientIdentityId: this.recipientIdentityId.valueOf() }),
      payload: this.payload,
      createdAt: this.createdAt.valueOf(),
      authorIdentityId: this.authorIdentityId.valueOf(),
      mutation: {}, // Will be filled by the caller with the actual mutation/proof
    };
  }
}
