import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NotificationsFindMessage {
  public readonly after: string | undefined;
  public readonly limit: number;
  public readonly recipientIdentityId: IdentityId;

  constructor(recipientIdentityId: string, limit: number, after?: string) {
    this.after = after;
    this.limit = limit;
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
  }
}
