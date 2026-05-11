import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class KeychainSyncResponseMessage {
  public readonly ownerIdentityId: IdentityId;

  constructor(
    ownerIdentityId: string,
    public readonly requestId?: string,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
  }
}
