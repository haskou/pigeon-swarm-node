import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { MLSRecord } from '../../../domain/MLSRecord';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { MLSRecordId } from '../../../domain/value-objects/MLSRecordId';
import { MLSRecordKind } from '../../../domain/value-objects/MLSRecordKind';
import { MLSRecordPublishPrimitives } from './MLSRecordPublishPrimitives';

export class MLSRecordPublishMessage {
  public readonly authorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly proof: PublicMutationProof;
  public readonly record: MLSRecord;

  constructor(primitives: MLSRecordPublishPrimitives) {
    this.authorIdentityId = new IdentityId(primitives.authorIdentityId);
    this.communityId = new CommunityId(primitives.communityId);
    this.proof = PublicMutationProof.fromPrimitives(primitives.mutation);
    this.record = new MLSRecord(
      MLSRecordId.derive({
        epoch: primitives.epoch,
        groupId: primitives.groupId,
        kind: primitives.kind,
        payload: primitives.payload,
        recipientIdentityId: primitives.recipientIdentityId,
      }),
      this.communityId,
      primitives.groupId,
      new MLSRecordKind(primitives.kind),
      primitives.payload,
      this.authorIdentityId,
      new Timestamp(primitives.createdAt),
      primitives.epoch,
      primitives.recipientIdentityId
        ? new IdentityId(primitives.recipientIdentityId)
        : undefined,
    );
  }
}
