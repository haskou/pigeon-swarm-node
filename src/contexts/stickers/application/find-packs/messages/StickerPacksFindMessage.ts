import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class StickerPacksFindMessage {
  public readonly ownerIdentityId?: IdentityId;

  constructor(ownerIdentityId?: string) {
    if (ownerIdentityId) {
      this.ownerIdentityId = new IdentityId(ownerIdentityId);
    }
  }
}
