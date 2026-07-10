import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { CallId } from './value-objects/CallId';

export class CallSignalDeliveryRoute {
  constructor(
    private readonly callId: CallId,
    private readonly ownerNodeId: NodeId,
    private readonly networkId: NetworkId,
    private readonly participantIds: IdentityId[],
  ) {}

  public isOwnedBy(nodeId: NodeId): boolean {
    return this.ownerNodeId.isEqual(nodeId);
  }

  public toPrimitives() {
    return {
      callId: this.callId.valueOf(),
      networkId: this.networkId.valueOf(),
      ownerNodeId: this.ownerNodeId.valueOf(),
      participantIds: this.participantIds.map((identityId) =>
        identityId.valueOf(),
      ),
    };
  }
}
