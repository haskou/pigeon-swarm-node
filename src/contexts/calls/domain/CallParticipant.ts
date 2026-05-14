import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

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
    );
  }

  public static ringing(identityId: IdentityId): CallParticipant {
    return new CallParticipant(identityId, CallParticipantStatus.RINGING);
  }

  public static fromPrimitives(primitives: {
    declinedAt?: number;
    identityId: string;
    joinedAt?: number;
    leftAt?: number;
    missedAt?: number;
    status: string;
  }): CallParticipant {
    return new CallParticipant(
      new IdentityId(primitives.identityId),
      new CallParticipantStatus(primitives.status),
      primitives.joinedAt ? new Timestamp(primitives.joinedAt) : undefined,
      primitives.leftAt ? new Timestamp(primitives.leftAt) : undefined,
      primitives.declinedAt ? new Timestamp(primitives.declinedAt) : undefined,
      primitives.missedAt ? new Timestamp(primitives.missedAt) : undefined,
    );
  }

  constructor(
    private readonly identityId: IdentityId,
    private status: CallParticipantStatus,
    private joinedAt?: Timestamp,
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

  public isActiveReceiver(): boolean {
    return this.status.isActiveReceiver();
  }

  public isRinging(): boolean {
    return this.status.isRinging();
  }

  public join(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.JOINED;
    this.joinedAt = now;
  }

  public leave(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.LEFT;
    this.leftAt = now;
  }

  public miss(now: Timestamp = Timestamp.now()): void {
    this.status = CallParticipantStatus.MISSED;
    this.missedAt = now;
  }

  public toPrimitives() {
    return {
      declinedAt: this.declinedAt?.valueOf(),
      identityId: this.identityId.valueOf(),
      joinedAt: this.joinedAt?.valueOf(),
      leftAt: this.leftAt?.valueOf(),
      missedAt: this.missedAt?.valueOf(),
      status: this.status.valueOf(),
    };
  }
}
