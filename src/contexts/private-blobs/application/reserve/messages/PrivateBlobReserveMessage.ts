import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class PrivateBlobReserveMessage {
  public readonly ownerIdentityId: IdentityId;
  public readonly size: number;

  constructor(ownerIdentityId: string, size: number) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.size = size;
  }
}
