import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class IdentityPresenceHeartbeatMessage {
  constructor(
    public readonly identityId: string,
    public readonly activityDetected: boolean = false,
  ) {}

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }
}
