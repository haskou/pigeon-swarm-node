import { Timestamp } from '@haskou/value-objects';

import { CallParticipantLease } from '../../domain/CallParticipantLease';

/**
 * Participant leases live only in this node's memory, so a node that just
 * started knows none of them. Until it has listened for one heartbeat timeout
 * after its call projection became ready, a joined participant without a
 * lease may still be connected elsewhere. The window is local and bounded:
 * nothing a peer publishes can open or extend it.
 */
export default class CallParticipantLeaseWarmUp {
  private listeningSince?: Timestamp;

  public begin(now: Timestamp = Timestamp.now()): void {
    this.listeningSince ??= now;
  }

  public isWarmingUp(now: Timestamp = Timestamp.now()): boolean {
    return (
      this.listeningSince === undefined ||
      now.valueOf() - this.listeningSince.valueOf() <
        CallParticipantLease.HEARTBEAT_TIMEOUT_MS
    );
  }
}
