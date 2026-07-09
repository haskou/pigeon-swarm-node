import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallParticipantLease } from '../../domain/CallParticipantLease';
import CallParticipantLeaseRepository from '../../domain/repositories/CallParticipantLeaseRepository';
import { CallId } from '../../domain/value-objects/CallId';

export default class InMemoryCallParticipantLeaseRepository extends CallParticipantLeaseRepository {
  private readonly leases = new Map<
    string,
    PrimitiveOf<CallParticipantLease>
  >();

  private key(primitives: PrimitiveOf<CallParticipantLease>): string {
    return [
      primitives.callId,
      primitives.participantIdentityId,
      primitives.ownerNodeId,
    ].join(':');
  }

  public findByCallIds(callIds: CallId[]): Promise<CallParticipantLease[]> {
    return Promise.resolve(
      [...this.leases.values()]
        .filter((lease) =>
          callIds.some((callId) => callId.isEqual(new CallId(lease.callId))),
        )
        .map((lease) => CallParticipantLease.fromPrimitives(lease)),
    );
  }

  public findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<CallParticipantLease[]> {
    return Promise.resolve(
      [...this.leases.values()]
        .map((lease) => CallParticipantLease.fromPrimitives(lease))
        .filter((lease) => lease.hasTimedOut(threshold)),
    );
  }

  public save(lease: CallParticipantLease): Promise<void> {
    const primitives = lease.toPrimitives();
    const key = this.key(primitives);
    const current = this.leases.get(key);

    if (
      current &&
      (current.lastHeartbeatAt > primitives.lastHeartbeatAt ||
        (current.lastHeartbeatAt === primitives.lastHeartbeatAt &&
          current.status === 'disconnected'))
    ) {
      return Promise.resolve();
    }

    this.leases.set(key, primitives);

    return Promise.resolve();
  }

  public purgeDisconnectedBefore(threshold: Timestamp): Promise<void> {
    for (const [key, lease] of this.leases) {
      if (
        lease.status === 'disconnected' &&
        lease.lastHeartbeatAt <= threshold.valueOf()
      ) {
        this.leases.delete(key);
      }
    }

    return Promise.resolve();
  }
}
