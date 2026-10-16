import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeBlockSourceRemoverMessage {
  public readonly ownerIdentityId: IdentityId;

  constructor(ownerIdentityId: string) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
  }
}
