import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallLifecycle } from './CallLifecycle';
import { CallParticipant } from './CallParticipant';
import { CallScope } from './CallScope';
import { CallParticipantNotFoundError } from './errors/CallParticipantNotFoundError';
import { InactiveCallError } from './errors/InactiveCallError';
import { CallEndedEvent } from './events/CallEndedEvent';
import { CallMissedEvent } from './events/CallMissedEvent';
import { CallParticipantDeclinedEvent } from './events/CallParticipantDeclinedEvent';
import { CallParticipantJoinedEvent } from './events/CallParticipantJoinedEvent';
import { CallParticipantLeftEvent } from './events/CallParticipantLeftEvent';
import { CallParticipantMissedEvent } from './events/CallParticipantMissedEvent';
import { CallSignalSentEvent } from './events/CallSignalSentEvent';
import { CallStartedEvent } from './events/CallStartedEvent';
import { CallId } from './value-objects/CallId';
import { CallSignalType } from './value-objects/CallSignalType';
import { CallStatus } from './value-objects/CallStatus';

export class Call extends AggregateRoot {
  public static start(
    creatorIdentityId: IdentityId,
    networkId: NetworkId,
    scope: CallScope,
    participantIds: IdentityId[],
  ): Call {
    const participants = [
      CallParticipant.joined(creatorIdentityId),
      ...participantIds
        .filter((participant) => participant.isNotEqual(creatorIdentityId))
        .map((participant) => CallParticipant.ringing(participant)),
    ];
    const call = new Call(
      CallId.generate(),
      networkId,
      scope,
      creatorIdentityId,
      participants,
      CallLifecycle.active(),
    );

    call.record(call.createStartedEvent());

    return call;
  }

  public static fromPrimitives(primitives: PrimitiveOf<Call>): Call {
    return new Call(
      new CallId(primitives.id),
      new NetworkId(primitives.networkId),
      CallScope.fromPrimitives(primitives.scope),
      new IdentityId(primitives.creatorIdentityId),
      primitives.participants.map((participant) =>
        CallParticipant.fromPrimitives(participant),
      ),
      new CallLifecycle(
        new CallStatus(primitives.status),
        new Timestamp(primitives.createdAt),
        primitives.endedAt ? new Timestamp(primitives.endedAt) : undefined,
        primitives.endedByIdentityId,
      ),
    );
  }

  constructor(
    private readonly id: CallId,
    private readonly networkId: NetworkId,
    private readonly scope: CallScope,
    private readonly creatorIdentityId: IdentityId,
    private readonly participants: CallParticipant[],
    private readonly lifecycle: CallLifecycle,
  ) {
    super();
  }

  private assertActive(): void {
    assert(this.lifecycle.getStatus().isActive(), new InactiveCallError());
  }

  private createStartedEvent(): CallStartedEvent {
    return new CallStartedEvent(this.id.valueOf(), {
      ...this.baseEventAttributes(),
      creatorIdentityId: this.creatorIdentityId.valueOf(),
    });
  }

  private baseEventAttributes() {
    const primitives = this.toPrimitives();

    return {
      callId: primitives.id,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      endedByIdentityId: primitives.endedByIdentityId,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      participants: primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
    };
  }

  private endIfNoReceiversRemain(): void {
    const hasReceiver = this.participants.some(
      (participant) =>
        participant.getIdentityId().isNotEqual(this.creatorIdentityId) &&
        participant.canReceiveSignal(),
    );

    if (hasReceiver) {
      return;
    }

    this.lifecycle.miss();
    this.record(
      new CallMissedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        missedIdentityIds: [],
      }),
    );
  }

  private findParticipant(identityId: IdentityId): CallParticipant | undefined {
    return this.participants.find((participant) => participant.is(identityId));
  }

  private hasActiveReceiver(): boolean {
    return this.participants.some(
      (participant) =>
        participant.getIdentityId().isNotEqual(this.creatorIdentityId) &&
        participant.isActiveReceiver(),
    );
  }

  public join(identityId: IdentityId): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(participant, new CallParticipantNotFoundError());
    participant.join();
    this.record(
      new CallParticipantJoinedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        joinedIdentityId: identityId.valueOf(),
      }),
    );
  }

  public recordParticipantHeartbeat(identityId: IdentityId): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(
      participant !== undefined && participant.isJoined(),
      new CallParticipantNotFoundError(),
    );
    participant.recordHeartbeat();
  }

  public joinOrAdd(identityId: IdentityId): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    if (participant?.isJoined()) {
      return;
    }

    if (participant) {
      participant.join();
    } else {
      this.participants.push(CallParticipant.joined(identityId));
    }

    this.record(
      new CallParticipantJoinedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        joinedIdentityId: identityId.valueOf(),
      }),
    );
  }

  public leave(identityId: IdentityId): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(participant, new CallParticipantNotFoundError());

    if (participant.isRinging()) {
      participant.decline();
      this.record(
        new CallParticipantDeclinedEvent(this.id.valueOf(), {
          ...this.baseEventAttributes(),
          declinedIdentityId: identityId.valueOf(),
        }),
      );
      this.endIfNoReceiversRemain();

      return;
    }

    participant.leave();
    this.record(
      new CallParticipantLeftEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        leftIdentityId: identityId.valueOf(),
      }),
    );
  }

  public end(identityId: IdentityId): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(participant?.isJoined(), new CallParticipantNotFoundError());
    this.lifecycle.end(identityId.valueOf());
    this.record(
      new CallEndedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        endedByIdentityId: identityId.valueOf(),
      }),
    );
  }

  public sendSignal(
    senderIdentityId: IdentityId,
    recipientIdentityId: IdentityId,
    signalType: CallSignalType,
    payload: unknown,
  ): void {
    this.assertActive();
    const sender = this.findParticipant(senderIdentityId);
    const recipient = this.findParticipant(recipientIdentityId);

    assert(sender?.isJoined(), new CallParticipantNotFoundError());
    assert(recipient?.canReceiveSignal(), new CallParticipantNotFoundError());
    this.record(
      new CallSignalSentEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        payload,
        recipientIdentityId: recipientIdentityId.valueOf(),
        senderIdentityId: senderIdentityId.valueOf(),
        signalType: signalType.valueOf(),
      }),
    );
  }

  public getId(): CallId {
    return this.id;
  }

  public hasParticipant(identityId: IdentityId): boolean {
    return Boolean(this.findParticipant(identityId));
  }

  public markTimedOut(timeout: Timestamp): IdentityId[] {
    this.assertActive();
    const missedParticipants = this.participants.filter((participant) =>
      participant.isRinging(),
    );

    for (const participant of missedParticipants) {
      participant.miss(timeout);
      this.record(
        new CallParticipantMissedEvent(this.id.valueOf(), {
          ...this.baseEventAttributes(),
          missedIdentityId: participant.getIdentityId().valueOf(),
        }),
      );
    }

    if (missedParticipants.length > 0 && !this.hasActiveReceiver()) {
      this.lifecycle.miss();
      this.record(
        new CallMissedEvent(this.id.valueOf(), {
          ...this.baseEventAttributes(),
          missedIdentityIds: missedParticipants.map((participant) =>
            participant.getIdentityId().valueOf(),
          ),
        }),
      );
    }

    return missedParticipants.map((participant) => participant.getIdentityId());
  }

  public markInactiveParticipants(timeoutThreshold: Timestamp): IdentityId[] {
    this.assertActive();
    const inactiveParticipants = this.participants.filter((participant) =>
      participant.hasTimedOut(timeoutThreshold),
    );
    const leftAt = Timestamp.now();

    for (const participant of inactiveParticipants) {
      participant.leave(leftAt);
      this.record(
        new CallParticipantLeftEvent(this.id.valueOf(), {
          ...this.baseEventAttributes(),
          leftIdentityId: participant.getIdentityId().valueOf(),
        }),
      );
    }

    return inactiveParticipants.map((participant) =>
      participant.getIdentityId(),
    );
  }

  public shouldRecordMissedCall(): boolean {
    return this.scope.isConversation();
  }

  public toPrimitives() {
    const participants = this.participants.map((participant) =>
      participant.toPrimitives(),
    );

    return {
      createdAt: this.lifecycle.getCreatedAt().valueOf(),
      creatorIdentityId: this.creatorIdentityId.valueOf(),
      endedAt: this.lifecycle.getEndedAt()?.valueOf(),
      endedByIdentityId: this.lifecycle.getEndedByIdentityId(),
      id: this.id.valueOf(),
      networkId: this.networkId.valueOf(),
      participantIds: participants.map((participant) => participant.identityId),
      participants,
      scope: this.scope.toPrimitives(),
      status: this.lifecycle.getStatus().valueOf(),
    };
  }
}
