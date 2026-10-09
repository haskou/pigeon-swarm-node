import { MLSRecord } from '@app/contexts/communities/domain/MLSRecord';

export class MLSRecordViewModel {
  constructor(private readonly record: MLSRecord) {}

  public toResource(): Record<string, unknown> {
    return {
      authorIdentityId: this.record.authorIdentityId.valueOf(),
      communityId: this.record.communityId.valueOf(),
      createdAt: this.record.createdAt.valueOf(),
      epoch: this.record.epoch,
      groupId: this.record.groupId,
      kind: this.record.kind.valueOf(),
      payload: this.record.payload,
      recipientIdentityId: this.record.recipientIdentityId?.valueOf(),
      recordId: this.record.id.valueOf(),
    };
  }
}
