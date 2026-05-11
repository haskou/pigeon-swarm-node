import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class IdentitySyncResponseMessage {
  public readonly identityId: IdentityId;

  constructor(
    identityId: string,
    public readonly requestId?: string,
  ) {
    this.identityId = new IdentityId(identityId);
  }
}
