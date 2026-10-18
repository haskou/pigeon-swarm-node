import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CommunityChannelDraftsFindMessage {
  public readonly after: string | undefined;
  public readonly identityId: IdentityId;
  public readonly limit: number;

  constructor(identityId: string, limit: number, after: string | undefined) {
    this.after = after;
    this.identityId = new IdentityId(identityId);
    this.limit = limit;
  }
}
