import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CommunitiesFindMessage {
  public readonly identityId: IdentityId;
  public readonly after?: string;
  public readonly limit: number;

  constructor(identityId: string, limit: number, after?: string) {
    this.identityId = new IdentityId(identityId);
    this.after = after;
    this.limit = limit;
  }
}
