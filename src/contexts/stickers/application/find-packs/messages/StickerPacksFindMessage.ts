import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class StickerPacksFindMessage {
  public readonly after: string | undefined;
  public readonly limit: number;
  public readonly ownerIdentityId?: IdentityId;

  constructor(
    ownerIdentityId: string | undefined,
    limit: number,
    after: string | undefined,
  ) {
    if (ownerIdentityId) {
      this.ownerIdentityId = new IdentityId(ownerIdentityId);
    }

    this.limit = limit;
    this.after = after;
  }
}
