import { Timestamp } from '@haskou/value-objects';

import { PollStatus, PollStatusValue } from './value-objects/PollStatus';

export class PollLifecycle {
  public static open(expiresAt?: Timestamp): PollLifecycle {
    return new PollLifecycle(PollStatus.OPEN, Timestamp.now(), expiresAt);
  }

  public static fromPrimitives(primitives: {
    createdAt: number;
    expiresAt?: number;
    status: PollStatusValue;
  }): PollLifecycle {
    return new PollLifecycle(
      new PollStatus(primitives.status),
      new Timestamp(primitives.createdAt),
      primitives.expiresAt ? new Timestamp(primitives.expiresAt) : undefined,
    );
  }

  constructor(
    private status: PollStatus,
    private readonly createdAt: Timestamp,
    private readonly expiresAt?: Timestamp,
  ) {}

  public close(): void {
    this.status = PollStatus.CLOSED;
  }

  public isClosed(): boolean {
    return this.status.isClosed();
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      expiresAt: this.expiresAt?.valueOf(),
      status: this.status.valueOf(),
    };
  }
}
