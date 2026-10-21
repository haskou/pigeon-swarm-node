import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { assert, Timestamp } from '@haskou/value-objects';

import { CallSignal } from '../../../domain/CallSignal';
import { CallSignalDelivery } from '../../../domain/CallSignalDelivery';
import { CallSignalDeliveryRoute } from '../../../domain/CallSignalDeliveryRoute';
import { CallSignalDeliverySchedule } from '../../../domain/CallSignalDeliverySchedule';
import { InvalidCallSignalError } from '../../../domain/errors/InvalidCallSignalError';
import { CallSignalSentAttributes } from '../../../domain/events/CallSignalSentAttributes';
import { CallSignalDeliveryAttempt } from '../../../domain/value-objects/CallSignalDeliveryAttempt';

export class CallSignalDeliveryRegisterMessage {
  private readonly attempt: CallSignalDeliveryAttempt;
  private readonly ownerNodeId: NodeId;
  private readonly participantIds: IdentityId[];
  private readonly sentAt: Timestamp;
  private readonly signal: CallSignal;

  /**
   * Built from a bus payload that may be hostile: every field goes through its
   * value object, and any malformed one is an `InvalidCallSignalError`, never
   * a raw error that would be retried.
   */
  constructor(attributes: CallSignalSentAttributes) {
    this.signal = CallSignal.fromPrimitives(attributes);

    try {
      assert(
        Array.isArray(attributes.participantIds),
        new InvalidCallSignalError(),
      );
      this.attempt = new CallSignalDeliveryAttempt(attributes.attempt);
      this.ownerNodeId = new NodeId(attributes.ownerNodeId);
      this.participantIds = attributes.participantIds.map(
        (participantId) => new IdentityId(participantId),
      );
      this.sentAt = new Timestamp(attributes.sentAt);
    } catch {
      throw new InvalidCallSignalError();
    }
  }

  /**
   * A signal that is expired or created far ahead of the clock is refused, and
   * so is a send time outside its lifetime or far ahead of the clock.
   */
  public assertSignalIsFresh(now: Timestamp): void {
    this.signal.assertFreshAt(now);
    this.signal.assertSentWithinLifetimeAt(this.sentAt, now);
  }

  public toDelivery(): CallSignalDelivery {
    return new CallSignalDelivery(
      new CallSignalDeliveryRoute(
        this.signal.getCallId(),
        this.ownerNodeId,
        this.signal.getNetworkId(),
        this.participantIds,
      ),
      this.signal,
      new CallSignalDeliverySchedule(
        this.attempt,
        this.sentAt,
        this.signal.getExpiresAt(),
        new Timestamp(this.sentAt.valueOf() + this.attempt.getRetryDelayMs()),
      ),
    );
  }
}
