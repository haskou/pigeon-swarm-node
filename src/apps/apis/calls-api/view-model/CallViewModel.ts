import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallResource } from '../resources/CallResource';

export class CallViewModel {
  constructor(
    private readonly call: Call,
    private readonly leases: CallParticipantLease[],
    private readonly authorizedParticipants: IdentityId[],
  ) {}

  public toResource(): CallResource {
    const primitives = this.call.toPrimitives();
    const participants = this.call
      .getActiveParticipants()
      .flatMap((participant) => {
        if (
          !this.authorizedParticipants.some((identityId) =>
            identityId.isEqual(participant.getIdentityId()),
          )
        )
          return [];

        const connected =
          this.call.isActive() &&
          this.leases.some(
            (lease) =>
              lease.belongsToCall(this.call.getId()) &&
              lease.belongsTo(participant.getIdentityId()) &&
              lease.isConnected(),
          );

        if (!connected && !participant.isRinging()) return [];

        return [
          {
            connected,
            identityId: participant.getIdentityId().valueOf(),
            mediaConnections: [] as never[],
            status: connected ? 'joined' : 'ringing',
          },
        ];
      });

    return {
      id: primitives.id,
      networkId: primitives.networkId,
      scope: primitives.scope,
      status: primitives.status,
      ...(this.call.getScope().isConversation()
        ? {
            createdAt: primitives.createdAt,
            creatorIdentityId: primitives.creatorIdentityId,
            ...(primitives.endedAt ? { endedAt: primitives.endedAt } : {}),
            ...(primitives.endedByIdentityId
              ? { endedByIdentityId: primitives.endedByIdentityId }
              : {}),
          }
        : {}),
      participantIds: participants.map((participant) => participant.identityId),
      participants,
    };
  }
}
