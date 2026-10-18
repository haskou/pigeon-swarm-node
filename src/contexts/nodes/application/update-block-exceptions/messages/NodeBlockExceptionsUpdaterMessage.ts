import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeBlockExceptionsUpdaterMessage {
  public readonly exceptions: NodeBlockEntries;
  public readonly authenticatedIdentityId: IdentityId;

  constructor(
    identityIds: string[],
    nodePeerIds: string[],
    authenticatedIdentityId: string,
  ) {
    this.exceptions = new NodeBlockEntries(
      identityIds.map((id) => new IdentityId(id)),
      nodePeerIds.map((id) => new NodePeerId(id)),
    );
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
