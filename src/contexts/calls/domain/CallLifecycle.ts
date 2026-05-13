import { Timestamp } from '@haskou/value-objects';

import { CallStatus, CallStatusEnum } from './value-objects/CallStatus';

export class CallLifecycle {
  public static active(): CallLifecycle {
    return new CallLifecycle(
      new CallStatus(CallStatusEnum.ACTIVE),
      Timestamp.now(),
    );
  }

  constructor(
    private status: CallStatus,
    private readonly createdAt: Timestamp,
    private endedAt?: Timestamp,
  ) {}

  public end(): void {
    this.status = new CallStatus(CallStatusEnum.ENDED);
    this.endedAt = Timestamp.now();
  }

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public getEndedAt(): Timestamp | undefined {
    return this.endedAt;
  }

  public getStatus(): CallStatus {
    return this.status;
  }
}
