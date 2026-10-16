import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';

import { NodeBlockSourcePendingResource } from '../resources/NodeBlockSourcePendingResource';

export class NodeBlockSourcePendingViewModel {
  constructor(private readonly source: NodeBlockSource) {}

  public toResource(): NodeBlockSourcePendingResource {
    const pending = this.source.pending().toPrimitives();
    const primitives = this.source.toPrimitives();

    return {
      blockedIdentityIds: pending.identityIds,
      blockedNodePeerIds: pending.nodePeerIds,
      ownerIdentityId: primitives.ownerIdentityId,
      version: primitives.list?.version ?? null,
    };
  }
}
