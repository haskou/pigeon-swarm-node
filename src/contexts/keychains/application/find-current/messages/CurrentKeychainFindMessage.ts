import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CurrentKeychainFindMessage {
  public readonly ownerIdentityId: IdentityId;

  constructor(ownerIdentityId: string) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
  }
}
