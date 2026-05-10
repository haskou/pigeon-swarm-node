import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeOwnerAssignerMessage {
  public readonly owner: IdentityId;
  public readonly authenticatedIdentityId: IdentityId;

  constructor(owner: string, authenticatedIdentityId: string) {
    this.owner = new IdentityId(owner);
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
