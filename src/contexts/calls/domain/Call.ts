import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallLifecycle } from './CallLifecycle';
import { CallScope } from './CallScope';
import { CallParticipantNotFoundError } from './errors/CallParticipantNotFoundError';
import { InactiveCallError } from './errors/InactiveCallError';
import { CallEndedEvent } from './events/CallEndedEvent';
import { CallParticipantJoinedEvent } from './events/CallParticipantJoinedEvent';
import { CallParticipantLeftEvent } from './events/CallParticipantLeftEvent';
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
      creatorIdentityId,
      ...participantIds.filter((participant) =>
        participant.isNotEqual(creatorIdentityId),
      ),
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
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      new CallLifecycle(
        new CallStatus(primitives.status),
        new Timestamp(primitives.createdAt),
        primitives.endedAt ? new Timestamp(primitives.endedAt) : undefined,
      ),
    );
  }

  constructor(
    private readonly id: CallId,
    private readonly networkId: NetworkId,
    private readonly scope: CallScope,
    private readonly creatorIdentityId: IdentityId,
    private readonly participantIds: IdentityId[],
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
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      scope: primitives.scope,
      status: primitives.status,
    };
  }

  public join(identityId: IdentityId): void {
    this.assertActive();

    if (
      this.participantIds.some((participant) => participant.isEqual(identityId))
    ) {
      return;
    }

    this.participantIds.push(identityId);
    this.record(
      new CallParticipantJoinedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        joinedIdentityId: identityId.valueOf(),
      }),
    );
  }

  public leave(identityId: IdentityId): void {
    this.assertActive();
    assert(
      this.participantIds.some((participant) =>
        participant.isEqual(identityId),
      ),
      new CallParticipantNotFoundError(),
    );

    this.participantIds.splice(
      this.participantIds.findIndex((participant) =>
        participant.isEqual(identityId),
      ),
      1,
    );
    this.record(
      new CallParticipantLeftEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        leftIdentityId: identityId.valueOf(),
      }),
    );
  }

  public end(identityId: IdentityId): void {
    this.assertActive();
    assert(
      this.participantIds.some((participant) =>
        participant.isEqual(identityId),
      ),
      new CallParticipantNotFoundError(),
    );
    this.lifecycle.end();
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
    assert(
      this.participantIds.some((participant) =>
        participant.isEqual(senderIdentityId),
      ),
      new CallParticipantNotFoundError(),
    );
    assert(
      this.participantIds.some((participant) =>
        participant.isEqual(recipientIdentityId),
      ),
      new CallParticipantNotFoundError(),
    );
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

  public toPrimitives() {
    return {
      createdAt: this.lifecycle.getCreatedAt().valueOf(),
      creatorIdentityId: this.creatorIdentityId.valueOf(),
      endedAt: this.lifecycle.getEndedAt()?.valueOf(),
      id: this.id.valueOf(),
      networkId: this.networkId.valueOf(),
      participantIds: this.participantIds.map((participantId) =>
        participantId.valueOf(),
      ),
      scope: this.scope.toPrimitives(),
      status: this.lifecycle.getStatus().valueOf(),
    };
  }
}
