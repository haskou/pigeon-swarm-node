import { Timestamp } from '@haskou/value-objects';

import { CallSignalDeliveryAttempt } from './value-objects/CallSignalDeliveryAttempt';

export class CallSignalDeliverySchedule {
  private static readonly DELIVERY_TTL_MS = 20_000;

  public static first(sentAt: Timestamp): CallSignalDeliverySchedule {
    const attempt = CallSignalDeliveryAttempt.first();

    return new CallSignalDeliverySchedule(
      attempt,
      sentAt,
      new Timestamp(
        sentAt.valueOf() + CallSignalDeliverySchedule.DELIVERY_TTL_MS,
      ),
      new Timestamp(sentAt.valueOf() + attempt.getRetryDelayMs()),
    );
  }

  constructor(
    private attempt: CallSignalDeliveryAttempt,
    private sentAt: Timestamp,
    private readonly expiresAt: Timestamp,
    private nextRetryAt: Timestamp,
    private acknowledgedAt?: Timestamp,
  ) {}

  public acknowledge(acknowledgedAt: Timestamp): boolean {
    if (this.isAcknowledged() || this.hasExpiredAt(acknowledgedAt)) {
      return false;
    }

    this.acknowledgedAt = acknowledgedAt;

    return true;
  }

  public confirmAcknowledgement(acknowledgedAt: Timestamp): boolean {
    return this.acknowledge(acknowledgedAt);
  }

  public hasExpiredAt(now: Timestamp): boolean {
    return now.isAfterOrEqual(this.expiresAt);
  }

  public isAcknowledged(): boolean {
    return this.acknowledgedAt !== undefined;
  }

  public isRetryableAt(now: Timestamp): boolean {
    return (
      !this.isAcknowledged() &&
      !this.hasExpiredAt(now) &&
      this.attempt.canRetry() &&
      now.isAfterOrEqual(this.nextRetryAt)
    );
  }

  public retry(now: Timestamp): boolean {
    if (!this.isRetryableAt(now)) {
      return false;
    }

    this.attempt = this.attempt.next();
    this.sentAt = now;
    this.nextRetryAt = new Timestamp(
      now.valueOf() + this.attempt.getRetryDelayMs(),
    );

    return true;
  }

  public supersedes(schedule: CallSignalDeliverySchedule): boolean {
    if (schedule.isAcknowledged()) {
      return this.isAcknowledged();
    }

    if (this.isAcknowledged()) {
      return true;
    }

    return this.attempt.isGreaterThan(schedule.attempt);
  }

  public toPrimitives() {
    return {
      acknowledgedAt: this.acknowledgedAt?.valueOf(),
      attempt: this.attempt.valueOf(),
      expiresAt: this.expiresAt.valueOf(),
      nextRetryAt: this.nextRetryAt.valueOf(),
      sentAt: this.sentAt.valueOf(),
    };
  }
}
