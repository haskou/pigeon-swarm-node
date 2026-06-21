import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class CommunitiesFindMessage {
  public readonly identityId: IdentityId;

  constructor(identityId: string) {
    this.identityId = new IdentityId(identityId);
  }
}
