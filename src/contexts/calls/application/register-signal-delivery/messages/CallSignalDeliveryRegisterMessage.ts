import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import { CallSignal } from '../../../domain/CallSignal';
import { CallSignalDelivery } from '../../../domain/CallSignalDelivery';
import { CallSignalDeliveryRoute } from '../../../domain/CallSignalDeliveryRoute';
import { CallSignalDeliverySchedule } from '../../../domain/CallSignalDeliverySchedule';
import { CallSignalSentAttributes } from '../../../domain/events/CallSignalSentAttributes';
import { CallSignalDeliveryAttempt } from '../../../domain/value-objects/CallSignalDeliveryAttempt';

export class CallSignalDeliveryRegisterMessage {
  private readonly attempt: CallSignalDeliveryAttempt;
  private readonly ownerNodeId: NodeId;
  private readonly participantIds: IdentityId[];
  private readonly sentAt: Timestamp;
  private readonly signal: CallSignal;

  constructor(attributes: CallSignalSentAttributes) {
    this.signal = CallSignal.fromPrimitives(attributes);
    this.attempt = new CallSignalDeliveryAttempt(attributes.attempt);
    this.ownerNodeId = new NodeId(attributes.ownerNodeId);
    this.participantIds = attributes.participantIds.map(
      (participantId) => new IdentityId(participantId),
    );
    this.sentAt = new Timestamp(attributes.sentAt);
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
