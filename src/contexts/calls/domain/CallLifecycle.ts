import { Timestamp } from '@haskou/value-objects';

import { CallId } from './value-objects/CallId';
import { CallStatus, CallStatusEnum } from './value-objects/CallStatus';

export class CallLifecycle {
  public static active(startedAt: Timestamp): CallLifecycle {
    return new CallLifecycle(new CallStatus(CallStatusEnum.ACTIVE), startedAt);
  }

  constructor(
    private status: CallStatus,
    private readonly createdAt: Timestamp,
    private endedAt?: Timestamp,
    private endedByIdentityId?: string,
    /** The live call of the same community channel that won over this one. */
    private readonly supersededByCallId?: CallId,
  ) {}

  public end(endedByIdentityId: string, at: Timestamp = Timestamp.now()): void {
    this.status = new CallStatus(CallStatusEnum.ENDED);
    this.endedAt = at;
    this.endedByIdentityId = endedByIdentityId;
  }

  /** Hides a call that outlived its limits: ended, but by nobody. */
  public expire(at: Timestamp): void {
    this.status = new CallStatus(CallStatusEnum.ENDED);
    this.endedAt = at;
  }

  public miss(at: Timestamp = Timestamp.now()): void {
    this.status = new CallStatus(CallStatusEnum.MISSED);
    this.endedAt = at;
  }

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public getEndedAt(): Timestamp | undefined {
    return this.endedAt;
  }

  public getEndedByIdentityId(): string | undefined {
    return this.endedByIdentityId;
  }

  public getSupersededByCallId(): CallId | undefined {
    return this.supersededByCallId;
  }

  public getStatus(): CallStatus {
    return this.status;
  }
}
