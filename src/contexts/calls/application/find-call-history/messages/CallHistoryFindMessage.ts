import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CallHistoryFindMessage {
  public readonly after: string | undefined;
  public readonly limit: number;
  public readonly requesterIdentityId: IdentityId;

  constructor(requesterIdentityId: string, limit: number, after?: string) {
    this.after = after;
    this.limit = limit;
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
