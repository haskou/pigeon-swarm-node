import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallLifecycle } from './CallLifecycle';
import { CallParticipant } from './CallParticipant';
import { CallScope } from './CallScope';
import { CallSignal } from './CallSignal';
import { CallSignalDelivery } from './CallSignalDelivery';
import { CallSignalDeliveryRoute } from './CallSignalDeliveryRoute';
import { CallParticipantNotFoundError } from './errors/CallParticipantNotFoundError';
import { InactiveCallError } from './errors/InactiveCallError';
import { CallEndedEvent } from './events/CallEndedEvent';
import { CallMissedEvent } from './events/CallMissedEvent';
import { CallParticipantDeclinedEvent } from './events/CallParticipantDeclinedEvent';
import { CallParticipantJoinedEvent } from './events/CallParticipantJoinedEvent';
import { CallParticipantLeftEvent } from './events/CallParticipantLeftEvent';
import { CallParticipantMissedEvent } from './events/CallParticipantMissedEvent';
import { CallStartedEvent } from './events/CallStartedEvent';
import { CallId } from './value-objects/CallId';
import { CallNonce } from './value-objects/CallNonce';
import { CallSessionEpoch } from './value-objects/CallSessionEpoch';
import { CallSignalId } from './value-objects/CallSignalId';
import { CallSignalType } from './value-objects/CallSignalType';
import { CallStatus } from './value-objects/CallStatus';

export class Call extends AggregateRoot {
  /** A call between two identities ends as soon as either one departs. */
  public static readonly ONE_TO_ONE_PARTICIPANTS = 2;

  public static start(
    creatorIdentityId: IdentityId,
    networkId: NetworkId,
    scope: CallScope,
    participantIds: IdentityId[],
    nonce: CallNonce,
    startedAt: Timestamp,
    sessionEpoch?: CallSessionEpoch,
  ): Call {
    const participants = [
      CallParticipant.joined(creatorIdentityId, startedAt),
      ...participantIds
        .filter((participant) => participant.isNotEqual(creatorIdentityId))
        .map((participant) => CallParticipant.ringing(participant)),
    ];
    const call = new Call(
      CallId.fromStart(creatorIdentityId, nonce),
      nonce,
      networkId,
      scope,
      creatorIdentityId,
      participants,
      CallLifecycle.active(startedAt),
      sessionEpoch,
    );

    call.record(call.createStartedEvent());

    return call;
  }

  public static fromPrimitives(primitives: PrimitiveOf<Call>): Call {
    return new Call(
      new CallId(primitives.id),
      new CallNonce(primitives.nonce),
      new NetworkId(primitives.networkId),
      CallScope.fromPrimitives(primitives.scope),
      new IdentityId(primitives.creatorIdentityId!),
      primitives.participants.map((participant) =>
        CallParticipant.fromPrimitives(participant),
      ),
      new CallLifecycle(
        new CallStatus(primitives.status),
        new Timestamp(primitives.createdAt),
        primitives.endedAt ? new Timestamp(primitives.endedAt) : undefined,
        primitives.endedByIdentityId,
      ),
      primitives.sessionEpoch === undefined
        ? undefined
        : new CallSessionEpoch(primitives.sessionEpoch),
    );
  }

  constructor(
    private readonly id: CallId,
    private readonly nonce: CallNonce,
    private readonly networkId: NetworkId,
    private readonly scope: CallScope,
    private readonly creatorIdentityId: IdentityId,
    private readonly participants: CallParticipant[],
    private readonly lifecycle: CallLifecycle,
    private readonly sessionEpoch?: CallSessionEpoch,
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
      participantIds: this.scope.isCommunityChannel()
        ? []
        : primitives.participantIds,
      participants: this.scope.isCommunityChannel()
        ? []
        : primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
      ...(primitives.sessionEpoch === undefined
        ? {}
        : { sessionEpoch: primitives.sessionEpoch }),
    };
  }

  private endIfNoReceiversRemain(at: Timestamp): void {
    const hasReceiver = this.participants.some(
      (participant) =>
        participant.getIdentityId().isNotEqual(this.creatorIdentityId) &&
        participant.canReceiveSignal(),
    );

    if (hasReceiver) {
      return;
    }

    this.lifecycle.miss(at);
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

  public join(identityId: IdentityId, at: Timestamp = Timestamp.now()): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(participant, new CallParticipantNotFoundError());
    participant.join(at);
    this.record(
      new CallParticipantJoinedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        joinedIdentityId: identityId.valueOf(),
      }),
    );
  }

  public joinOrAdd(
    identityId: IdentityId,
    at: Timestamp = Timestamp.now(),
  ): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    if (participant?.isJoined()) {
      return;
    }

    if (participant) {
      participant.join(at);
    } else {
      this.participants.push(CallParticipant.joined(identityId, at));
    }

    this.record(
      new CallParticipantJoinedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        joinedIdentityId: identityId.valueOf(),
      }),
    );
  }

  public leave(identityId: IdentityId, at: Timestamp = Timestamp.now()): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(participant, new CallParticipantNotFoundError());

    if (participant.isRinging()) {
      participant.decline(at);
      this.record(
        new CallParticipantDeclinedEvent(this.id.valueOf(), {
          ...this.baseEventAttributes(),
          declinedIdentityId: identityId.valueOf(),
        }),
      );
      this.endIfNoReceiversRemain(at);

      return;
    }

    participant.leave(at);

    if (
      this.scope.isConversation() &&
      (this.participants.length <= Call.ONE_TO_ONE_PARTICIPANTS ||
        !this.participants.some((candidate) => candidate.isJoined()))
    ) {
      this.lifecycle.end(identityId.valueOf(), at);
    }

    this.record(
      new CallParticipantLeftEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        leftIdentityId: identityId.valueOf(),
      }),
    );

    if (!this.isActive()) {
      this.record(
        new CallEndedEvent(this.id.valueOf(), this.baseEventAttributes()),
      );
    }
  }

  public end(identityId: IdentityId, at: Timestamp = Timestamp.now()): void {
    this.assertActive();
    const participant = this.findParticipant(identityId);

    assert(
      this.scope.isCommunityChannel()
        ? this.creatorIdentityId.isEqual(identityId)
        : participant?.isJoined(),
      new CallParticipantNotFoundError(),
    );
    this.lifecycle.end(identityId.valueOf(), at);
    this.record(
      new CallEndedEvent(this.id.valueOf(), {
        ...this.baseEventAttributes(),
        endedByIdentityId: identityId.valueOf(),
      }),
    );
  }

  /** Applies a signed end record: any participant the policy admitted may end. */
  public endFromRecord(identityId: IdentityId, at: Timestamp): void {
    if (!this.isActive()) return;

    this.lifecycle.end(identityId.valueOf(), at);
  }

  /** Ends a call that outlived its limits or lost its channel to another call. */
  public expire(at: Timestamp): void {
    if (!this.isActive()) return;

    this.lifecycle.expire(at);
  }

  public sendSignal(
    signalId: CallSignalId,
    ownerNodeId: NodeId,
    senderIdentityId: IdentityId,
    recipientIdentityId: IdentityId,
    signalType: CallSignalType,
    payload: unknown,
    sentAt: Timestamp = Timestamp.now(),
  ): CallSignalDelivery {
    this.assertActive();
    const sender = this.findParticipant(senderIdentityId);
    const recipient = this.findParticipant(recipientIdentityId);

    assert(sender?.isJoined(), new CallParticipantNotFoundError());
    assert(recipient?.canReceiveSignal(), new CallParticipantNotFoundError());

    return CallSignalDelivery.send(
      signalId,
      new CallSignalDeliveryRoute(
        this.id,
        ownerNodeId,
        this.networkId,
        this.participants.map((participant) => participant.getIdentityId()),
      ),
      new CallSignal(
        senderIdentityId,
        recipientIdentityId,
        signalType,
        payload,
      ),
      sentAt,
    );
  }

  public restoreCommunityParticipants(identityIds: IdentityId[]): void {
    if (!this.scope.isCommunityChannel()) return;

    this.participants.splice(
      0,
      this.participants.length,
      ...identityIds.map((identityId) => CallParticipant.joined(identityId)),
    );
  }

  public getSessionEpoch(): CallSessionEpoch | undefined {
    return this.sessionEpoch;
  }

  public getScope(): CallScope {
    return this.scope;
  }

  public getId(): CallId {
    return this.id;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getCommunityChannelId(): CommunityChannelId | undefined {
    return this.scope.getCommunityChannelId();
  }

  public getActiveParticipants(): CallParticipant[] {
    return this.isActive()
      ? this.participants.filter((participant) =>
          participant.isActiveReceiver(),
        )
      : [];
  }

  public getJoinedParticipantIds(): IdentityId[] {
    return this.participants
      .filter((participant) => participant.isJoined())
      .map((participant) => participant.getIdentityId());
  }

  public getParticipantIds(): IdentityId[] {
    return this.participants.map((participant) => participant.getIdentityId());
  }

  public hasParticipant(identityId: IdentityId): boolean {
    return Boolean(this.findParticipant(identityId));
  }

  public isActive(): boolean {
    return this.lifecycle.getStatus().isActive();
  }

  public hasJoinedParticipant(identityId: IdentityId): boolean {
    return this.findParticipant(identityId)?.isJoined() === true;
  }

  public assertParticipantCanHeartbeat(identityId: IdentityId): void {
    this.assertActive();
    assert(
      this.hasJoinedParticipant(identityId),
      new CallParticipantNotFoundError(),
    );
  }

  public getCreatorIdentityId(): IdentityId {
    return this.creatorIdentityId;
  }

  public getNonce(): CallNonce {
    return this.nonce;
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
      this.lifecycle.miss(timeout);
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
      nonce: this.nonce.valueOf(),
      participantIds: participants.map((participant) => participant.identityId),
      participants,
      scope: this.scope.toPrimitives(),
      status: this.lifecycle.getStatus().valueOf(),
      ...(this.sessionEpoch
        ? { sessionEpoch: this.sessionEpoch.valueOf() }
        : {}),
    };
  }
}
