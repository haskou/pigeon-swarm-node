import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class PrivateBlobReserveMessage {
  public readonly ownerIdentityId: IdentityId;
  public readonly size: number;

  constructor(ownerIdentityId: IdentityId, size: number) {
    this.ownerIdentityId = ownerIdentityId;
    this.size = size;
  }
}
