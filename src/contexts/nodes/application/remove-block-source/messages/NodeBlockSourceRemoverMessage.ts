import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeBlockSourceRemoverMessage {
  public readonly ownerIdentityId: IdentityId;
  public readonly authenticatedIdentityId: IdentityId;

  constructor(ownerIdentityId: string, authenticatedIdentityId: string) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
