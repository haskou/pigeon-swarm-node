import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class ActiveCallsFindMessage {
  public readonly requesterIdentityId: IdentityId;

  constructor(requesterIdentityId: string) {
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
