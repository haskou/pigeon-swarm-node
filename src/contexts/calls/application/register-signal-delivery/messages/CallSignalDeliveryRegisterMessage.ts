import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import { CallSignal } from '../../../domain/CallSignal';
import { CallSignalDelivery } from '../../../domain/CallSignalDelivery';
import { CallSignalDeliveryRoute } from '../../../domain/CallSignalDeliveryRoute';
import { CallSignalDeliverySchedule } from '../../../domain/CallSignalDeliverySchedule';
import { CallSignalSentAttributes } from '../../../domain/events/CallSignalSentAttributes';
import { CallId } from '../../../domain/value-objects/CallId';
import { CallSignalDeliveryAttempt } from '../../../domain/value-objects/CallSignalDeliveryAttempt';
import { CallSignalId } from '../../../domain/value-objects/CallSignalId';
import { CallSignalType } from '../../../domain/value-objects/CallSignalType';

export class CallSignalDeliveryRegisterMessage {
  private readonly attempt: CallSignalDeliveryAttempt;
  private readonly callId: CallId;
  private readonly expiresAt: Timestamp;
  private readonly networkId: NetworkId;
  private readonly ownerNodeId: NodeId;
  private readonly participantIds: IdentityId[];
  private readonly payload: unknown;
  private readonly recipientIdentityId: IdentityId;
  private readonly senderIdentityId: IdentityId;
  private readonly sentAt: Timestamp;
  private readonly signalId: CallSignalId;
  private readonly signalType: CallSignalType;

  constructor(attributes: CallSignalSentAttributes) {
    this.signalId = new CallSignalId(attributes.signalId);
    this.callId = new CallId(attributes.callId);
    this.ownerNodeId = new NodeId(attributes.ownerNodeId);
    this.networkId = new NetworkId(attributes.networkId);
    this.participantIds = attributes.participantIds.map(
      (participantId) => new IdentityId(participantId),
    );
    this.senderIdentityId = new IdentityId(attributes.senderIdentityId);
    this.recipientIdentityId = new IdentityId(attributes.recipientIdentityId);
    this.signalType = new CallSignalType(attributes.signalType);
    this.payload = attributes.payload;
    this.attempt = new CallSignalDeliveryAttempt(attributes.attempt);
    this.sentAt = new Timestamp(attributes.sentAt);
    this.expiresAt = new Timestamp(attributes.expiresAt);
  }

  public toDelivery(): CallSignalDelivery {
    return new CallSignalDelivery(
      this.signalId,
      new CallSignalDeliveryRoute(
        this.callId,
        this.ownerNodeId,
        this.networkId,
        this.participantIds,
      ),
      new CallSignal(
        this.senderIdentityId,
        this.recipientIdentityId,
        this.signalType,
        this.payload,
      ),
      new CallSignalDeliverySchedule(
        this.attempt,
        this.sentAt,
        this.expiresAt,
        new Timestamp(this.sentAt.valueOf() + this.attempt.getRetryDelayMs()),
      ),
    );
  }
}
