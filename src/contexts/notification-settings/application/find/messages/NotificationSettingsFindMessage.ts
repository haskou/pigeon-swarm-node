import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NotificationSettingsFindMessage {
  constructor(private readonly identityId: string) {}

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }
}
