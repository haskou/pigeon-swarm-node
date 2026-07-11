import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf, Timestamp, assert } from '@haskou/value-objects';

import { CallSignal } from './CallSignal';
import { CallSignalDeliveryRoute } from './CallSignalDeliveryRoute';
import { CallSignalDeliverySchedule } from './CallSignalDeliverySchedule';
import { CallSignalRecipientMismatchError } from './errors/CallSignalRecipientMismatchError';
import { CallSignalAcknowledgedEvent } from './events/CallSignalAcknowledgedEvent';
import { CallSignalSentEvent } from './events/CallSignalSentEvent';
import { CallId } from './value-objects/CallId';
import { CallSignalDeliveryAttempt } from './value-objects/CallSignalDeliveryAttempt';
import { CallSignalId } from './value-objects/CallSignalId';
import { CallSignalType } from './value-objects/CallSignalType';

export class CallSignalDelivery extends AggregateRoot {
  public static send(
    signalId: CallSignalId,
    route: CallSignalDeliveryRoute,
    signal: CallSignal,
    sentAt: Timestamp = Timestamp.now(),
  ): CallSignalDelivery {
    const delivery = new CallSignalDelivery(
      signalId,
      route,
      signal,
      CallSignalDeliverySchedule.first(sentAt),
    );

    delivery.recordSent();

    return delivery;
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CallSignalDelivery>,
  ): CallSignalDelivery {
    return new CallSignalDelivery(
      new CallSignalId(primitives.signalId),
      new CallSignalDeliveryRoute(
        new CallId(primitives.callId),
        new NodeId(primitives.ownerNodeId),
        new NetworkId(primitives.networkId),
        primitives.participantIds.map(
          (participantId) => new IdentityId(participantId),
        ),
      ),
      new CallSignal(
        new IdentityId(primitives.senderIdentityId),
        new IdentityId(primitives.recipientIdentityId),
        new CallSignalType(primitives.signalType),
        primitives.payload,
      ),
      new CallSignalDeliverySchedule(
        new CallSignalDeliveryAttempt(primitives.attempt),
        new Timestamp(primitives.sentAt),
        new Timestamp(primitives.expiresAt),
        new Timestamp(primitives.nextRetryAt),
        primitives.acknowledgedAt
          ? new Timestamp(primitives.acknowledgedAt)
          : undefined,
      ),
    );
  }

  constructor(
    private readonly signalId: CallSignalId,
    private readonly route: CallSignalDeliveryRoute,
    private readonly signal: CallSignal,
    private readonly schedule: CallSignalDeliverySchedule,
  ) {
    super();
  }

  private assertRecipient(identityId: IdentityId): void {
    assert(
      this.signal.isRecipient(identityId),
      new CallSignalRecipientMismatchError(),
    );
  }

  private recordSent(): void {
    const primitives = this.toPrimitives();

    this.record(
      new CallSignalSentEvent(primitives.callId, {
        attempt: primitives.attempt,
        callId: primitives.callId,
        expiresAt: primitives.expiresAt,
        networkId: primitives.networkId,
        ownerNodeId: primitives.ownerNodeId,
        participantIds: primitives.participantIds,
        payload: primitives.payload,
        recipientIdentityId: primitives.recipientIdentityId,
        senderIdentityId: primitives.senderIdentityId,
        sentAt: primitives.sentAt,
        signalId: primitives.signalId,
        signalType: primitives.signalType,
      }),
    );
  }

  private recordAcknowledged(acknowledgedAt: Timestamp): void {
    const primitives = this.toPrimitives();

    this.record(
      new CallSignalAcknowledgedEvent(primitives.callId, {
        acknowledgedAt: acknowledgedAt.valueOf(),
        callId: primitives.callId,
        networkId: primitives.networkId,
        ownerNodeId: primitives.ownerNodeId,
        recipientIdentityId: primitives.recipientIdentityId,
        senderIdentityId: primitives.senderIdentityId,
        signalId: primitives.signalId,
      }),
    );
  }

  public acknowledge(
    recipientIdentityId: IdentityId,
    acknowledgedAt: Timestamp = Timestamp.now(),
  ): boolean {
    this.assertRecipient(recipientIdentityId);

    if (this.schedule.isAcknowledged()) {
      this.recordAcknowledged(acknowledgedAt);

      return true;
    }

    if (!this.schedule.acknowledge(acknowledgedAt)) {
      return false;
    }

    this.recordAcknowledged(acknowledgedAt);

    return true;
  }

  public confirmAcknowledgement(
    recipientIdentityId: IdentityId,
    acknowledgedAt: Timestamp,
  ): boolean {
    this.assertRecipient(recipientIdentityId);

    return this.schedule.confirmAcknowledgement(acknowledgedAt);
  }

  public getId(): CallSignalId {
    return this.signalId;
  }

  public getNextMaintenanceAt(ownerNodeId: NodeId): Timestamp | undefined {
    return this.isOwnedBy(ownerNodeId)
      ? this.schedule.getNextMaintenanceAt()
      : this.schedule.getExpirationAt();
  }

  public hasExpiredAt(now: Timestamp): boolean {
    return this.schedule.hasExpiredAt(now);
  }

  public isAcknowledged(): boolean {
    return this.schedule.isAcknowledged();
  }

  public isOwnedBy(nodeId: NodeId): boolean {
    return this.route.isOwnedBy(nodeId);
  }

  public isRetryableAt(now: Timestamp): boolean {
    return this.schedule.isRetryableAt(now);
  }

  public retry(now: Timestamp = Timestamp.now()): boolean {
    if (!this.schedule.retry(now)) {
      return false;
    }

    this.recordSent();

    return true;
  }

  public supersedes(delivery: CallSignalDelivery): boolean {
    return this.schedule.supersedes(delivery.schedule);
  }

  public toPrimitives() {
    return {
      ...this.route.toPrimitives(),
      ...this.schedule.toPrimitives(),
      ...this.signal.toPrimitives(),
      signalId: this.signalId.valueOf(),
    };
  }
}
