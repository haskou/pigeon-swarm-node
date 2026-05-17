import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CallParticipantStatus } from './value-objects/CallParticipantStatus';

export class CallParticipant {
  public static joined(
    identityId: IdentityId,
    joinedAt: Timestamp = Timestamp.now(),
  ): CallParticipant {
    return new CallParticipant(
      identityId,
      CallParticipantStatus.JOINED,
      joinedAt,
      joinedAt,
    );
  }

  public static ringing(identityId: IdentityId): CallParticipant {
    return new CallParticipant(identityId, CallParticipantStatus.RINGING);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CallParticipant>,
  ): CallParticipant {
    return new CallParticipant(
      new IdentityId(primitives.identityId),
      new CallParticipantStatus(primitives.status),
      primitives.joinedAt ? new Timestamp(primitives.joinedAt) : undefined,
      primitives.lastSeenAt
        ? new Timestamp(primitives.lastSeenAt)
        : primitives.joinedAt
          ? new Timestamp(primitives.joinedAt)
          : undefined,
      primitives.leftAt ? new Timestamp(primitives.leftAt) : undefined,
      primitives.declinedAt ? new Timestamp(primitives.declinedAt) : undefined,
      primitives.missedAt ? new Timestamp(primitives.missedAt) : undefined,
    );
  }

  constructor(
    private readonly identityId: IdentityId,
    private status: CallParticipantStatus,
    private joinedAt?: Timestamp,
    private lastSeenAt?: Timestamp,
    private leftAt?: Timestamp,
    private declinedAt?: Timestamp,
    private missedAt?: Timestamp,
  ) {}

  public canReceiveSignal(): boolean {
    return this.status.canReceiveSignal();
  }

  public decline(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.DECLINED;
    this.declinedAt = now;
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public is(identityId: IdentityId): boolean {
    return this.identityId.isEqual(identityId);
  }

  public isJoined(): boolean {
    return this.status.isJoined();
  }

  public hasTimedOut(timeoutThreshold: Timestamp): boolean {
    if (!this.lastSeenAt) {
      return false;
    }

    const lastSeenAt = this.lastSeenAt.valueOf();
    const timeout = timeoutThreshold.valueOf();

    return this.isJoined() && lastSeenAt <= timeout;
  }

  public isActiveReceiver(): boolean {
    return this.status.isActiveReceiver();
  }

  public isRinging(): boolean {
    return this.status.isRinging();
  }

  public join(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.JOINED;
    this.joinedAt = now;
    this.lastSeenAt = now;
  }

  public leave(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.LEFT;
    this.leftAt = now;
  }

  public miss(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.MISSED;
    this.missedAt = now;
  }

  public recordHeartbeat(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.JOINED;
    this.lastSeenAt = now;
  }

  public toPrimitives() {
    return {
      identityId: this.identityId.valueOf(),
      ...(this.declinedAt ? { declinedAt: this.declinedAt.valueOf() } : {}),
      ...(this.joinedAt ? { joinedAt: this.joinedAt.valueOf() } : {}),
      ...(this.lastSeenAt ? { lastSeenAt: this.lastSeenAt.valueOf() } : {}),
      ...(this.leftAt ? { leftAt: this.leftAt.valueOf() } : {}),
      ...(this.missedAt ? { missedAt: this.missedAt.valueOf() } : {}),
      status: this.status.valueOf(),
    };
  }
}
