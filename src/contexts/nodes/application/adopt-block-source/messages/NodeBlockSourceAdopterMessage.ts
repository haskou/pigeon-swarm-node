import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeBlockSourceAdopterMessage {
  public readonly ownerIdentityId: IdentityId;
  public readonly origin: NodeBlockSourceOrigin;
  public readonly authenticatedIdentityId: IdentityId;

  constructor(
    ownerIdentityId: string,
    origin: string,
    public readonly autoApply: boolean,
    authenticatedIdentityId: string,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.origin = new NodeBlockSourceOrigin(origin);
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
