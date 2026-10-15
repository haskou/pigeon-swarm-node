import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipant } from '@app/contexts/calls/domain/CallParticipant';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallResource } from '../resources/CallResource';

export class CallViewModel {
  /**
   * @param leasesWarmingUp The node may not have heard every participant's
   * lease yet: a joined participant without any lease is then presented as
   * joined but not connected instead of being dropped.
   */
  constructor(
    private readonly call: Call,
    private readonly leases: CallParticipantLease[],
    private readonly authorizedParticipants: IdentityId[],
    private readonly leasesWarmingUp: boolean,
  ) {}

  private leasesOf(participantId: IdentityId): CallParticipantLease[] {
    return this.leases.filter(
      (lease) =>
        lease.belongsToCall(this.call.getId()) &&
        lease.belongsTo(participantId),
    );
  }

  private isUnheard(
    participant: CallParticipant,
    leases: CallParticipantLease[],
  ): boolean {
    return (
      this.leasesWarmingUp && leases.length === 0 && !participant.isRinging()
    );
  }

  /** Only called for active participants of an active call. */
  private presentParticipant(
    participant: CallParticipant,
  ): CallResource['participants'] {
    const identityId = participant.getIdentityId();

    if (
      !this.authorizedParticipants.some((authorized) =>
        authorized.isEqual(identityId),
      )
    )
      return [];

    const leases = this.leasesOf(identityId);
    const connected = leases.some((lease) => lease.isConnected());

    if (connected || this.isUnheard(participant, leases))
      return [
        { connected, identityId: identityId.valueOf(), status: 'joined' },
      ];

    return participant.isRinging()
      ? [{ connected, identityId: identityId.valueOf(), status: 'ringing' }]
      : [];
  }

  public toResource(): CallResource {
    const primitives = this.call.toPrimitives();
    const participants = this.call
      .getActiveParticipants()
      .flatMap((participant) => this.presentParticipant(participant));

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
      ...(primitives.supersededByCallId
        ? { supersededByCallId: primitives.supersededByCallId }
        : {}),
      participantIds: participants.map((participant) => participant.identityId),
      participants,
    };
  }
}
