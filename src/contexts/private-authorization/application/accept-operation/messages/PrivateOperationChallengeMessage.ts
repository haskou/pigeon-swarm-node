import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class PrivateOperationChallengeMessage {
  public readonly authenticatedIdentityId: IdentityId;

  public constructor(
    authenticatedIdentityId: string,
    public readonly signedOperationJson: string,
  ) {
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
