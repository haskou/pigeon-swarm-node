import { Timestamp } from '@haskou/value-objects';

import { CallParticipantLease } from '../CallParticipantLease';
import { CallId } from '../value-objects/CallId';

export default abstract class CallParticipantLeaseRepository {
  public abstract findByCallIds(
    callIds: CallId[],
  ): Promise<CallParticipantLease[]>;

  public abstract findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<CallParticipantLease[]>;

  public abstract purgeDisconnectedBefore(threshold: Timestamp): Promise<void>;

  public abstract save(lease: CallParticipantLease): Promise<void>;
}
