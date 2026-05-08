import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class RegisterPublishedIdentityMessage {
  public readonly identityId: IdentityId;

  constructor(identityId: string | IdentityId) {
    this.identityId =
      identityId instanceof IdentityId
        ? identityId
        : new IdentityId(identityId);
  }
}
