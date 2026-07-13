import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { CallId } from './value-objects/CallId';

export class CallParticipantLeaseRoute {
  constructor(
    private readonly callId: CallId,
    private readonly ownerNodeId: NodeId,
    private readonly networkId: NetworkId,
    private readonly participantIds: IdentityId[],
  ) {}

  public belongsToCall(callId: CallId): boolean {
    return this.callId.isEqual(callId);
  }

  public belongsToNode(nodeId: NodeId): boolean {
    return this.ownerNodeId.isEqual(nodeId);
  }

  public hasParticipant(identityId: IdentityId): boolean {
    return this.participantIds.some((participantId) =>
      participantId.isEqual(identityId),
    );
  }

  public includesAllParticipants(participantIds: IdentityId[]): boolean {
    return participantIds.every((participantId) =>
      this.hasParticipant(participantId),
    );
  }

  public leaseIdFor(participantIdentityId: IdentityId): string {
    return [
      this.callId.valueOf(),
      participantIdentityId.valueOf(),
      this.ownerNodeId.valueOf(),
    ].join(':');
  }

  public includingParticipants(
    participantIds: IdentityId[],
  ): CallParticipantLeaseRoute {
    const additionalParticipantIds = participantIds.filter(
      (participantId, index) =>
        !this.hasParticipant(participantId) &&
        participantIds.findIndex((candidate) =>
          candidate.isEqual(participantId),
        ) === index,
    );

    return new CallParticipantLeaseRoute(
      this.callId,
      this.ownerNodeId,
      this.networkId,
      [...this.participantIds, ...additionalParticipantIds],
    );
  }

  public toPrimitives() {
    return {
      callId: this.callId.valueOf(),
      networkId: this.networkId.valueOf(),
      ownerNodeId: this.ownerNodeId.valueOf(),
      participantIds: this.participantIds.map((participantId) =>
        participantId.valueOf(),
      ),
    };
  }
}
