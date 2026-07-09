import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallParticipantStatus } from '@app/contexts/calls/domain/value-objects/CallParticipantStatus';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallParticipantMediaConnectionResource } from '../resources/CallParticipantMediaConnectionResource';
import { CallResource } from '../resources/CallResource';

export class CallViewModel {
  constructor(
    private readonly call: Call,
    private readonly leases: CallParticipantLease[],
  ) {}

  private participantConnection(identityId: string): {
    connected: boolean;
    lastHeartbeatAt?: number;
    mediaConnections: CallParticipantMediaConnectionResource[];
  } {
    const participantIdentityId = new IdentityId(identityId);
    const connectedLeases = this.leases.filter(
      (lease) =>
        this.call.isActive() &&
        lease.belongsToCall(this.call.getId()) &&
        lease.belongsTo(participantIdentityId) &&
        lease.isConnected(),
    );
    const latestLease = connectedLeases.reduce<
      CallParticipantLease | undefined
    >((latest, lease) => {
      if (
        !latest ||
        lease.getLastHeartbeatAt().isAfter(latest.getLastHeartbeatAt())
      ) {
        return lease;
      }

      return latest;
    }, undefined);

    return {
      connected: connectedLeases.length > 0,
      ...(latestLease
        ? { lastHeartbeatAt: latestLease.getLastHeartbeatAt().valueOf() }
        : {}),
      mediaConnections:
        latestLease?.getMediaConnections().map((mediaConnection) => ({
          ...mediaConnection.toPrimitives(),
          usesRelay: mediaConnection.usesRelay(),
        })) ?? [],
    };
  }

  public toResource(): CallResource {
    const primitives = this.call.toPrimitives();

    return {
      ...primitives,
      participants: primitives.participants.map((participant) => {
        const connection = this.participantConnection(participant.identityId);
        const participantStatus = new CallParticipantStatus(participant.status);

        return {
          ...participant,
          ...connection,
          status:
            connection.connected && participantStatus.isRinging()
              ? CallParticipantStatus.JOINED.valueOf()
              : participant.status,
        };
      }),
    };
  }
}
