import { Timestamp } from '@haskou/value-objects';

export class NotificationMuteUntil {
  public static forever(): NotificationMuteUntil {
    return new NotificationMuteUntil();
  }

  public static fromTimestamp(timestamp: Timestamp): NotificationMuteUntil {
    return new NotificationMuteUntil(timestamp);
  }

  private constructor(private readonly value?: Timestamp) {}

  public hasExpired(now: Timestamp): boolean {
    return this.value !== undefined && this.value.isBeforeOrEqual(now);
  }

  public isActive(now: Timestamp): boolean {
    return !this.hasExpired(now);
  }

  public toPrimitives(): number | null {
    return this.value ? this.value.valueOf() : null;
  }
}
