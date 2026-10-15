import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';

import { NodeBlockSourceResource } from '../resources/NodeBlockSourceResource';

export class NodeBlockSourceViewModel {
  constructor(private readonly source: NodeBlockSource) {}

  public toResource(): NodeBlockSourceResource {
    const primitives = this.source.toPrimitives();

    return {
      appliedCount: this.source.applied().count(),
      autoApply: primitives.autoApply,
      lastFetchedAt: primitives.lastFetch?.at ?? null,
      lastFetchOutcome: primitives.lastFetch?.outcome ?? null,
      origin: primitives.origin,
      ownerIdentityId: primitives.ownerIdentityId,
      pendingCount: this.source.pending().count(),
      version: primitives.list?.version ?? null,
    };
  }
}
