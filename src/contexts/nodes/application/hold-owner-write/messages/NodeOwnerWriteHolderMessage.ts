import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeOwnerWriteHolderMessage {
  public readonly authenticatedIdentityId: IdentityId;

  constructor(authenticatedIdentityId: string) {
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
