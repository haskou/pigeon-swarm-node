import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceSealingRecord } from '@app/contexts/identity-devices/domain/DeviceSealingRecord';

const ONE_DAY_MS = 86_400_000;

export default class DeviceSealingRecordPolicy {
  private isAuthorized(
    record: DeviceSealingRecord,
    authorizationOf: () => DeviceAuthorization | undefined,
  ): boolean {
    const authorization = authorizationOf();

    return (
      authorization !== undefined &&
      record.getIdentityId().valueOf() ===
        authorization.getIdentityId().valueOf() &&
      authorization.isAuthorized(record.getDeviceCredential())
    );
  }

  /**
   * Ingress: a record is admitted only when it is for a current day, carries a
   * valid signature and is authorized. The authorization is a provider, asked
   * last, so a record that fails the cheap checks never costs that work.
   */
  public admits(
    record: DeviceSealingRecord,
    authorizationOf: () => DeviceAuthorization | undefined,
    now: Date,
  ): boolean {
    return (
      this.isCurrentDay(record.getUtcDay(), now) &&
      record.hasValidSignature() &&
      this.isAuthorized(record, authorizationOf)
    );
  }

  /**
   * Read path: a stored record that passed ingress is served again without a
   * second signature check, so a read costs no signature verification.
   */
  public serves(
    record: DeviceSealingRecord,
    authorizationOf: () => DeviceAuthorization | undefined,
    now: Date,
  ): boolean {
    return (
      this.isCurrentDay(record.getUtcDay(), now) &&
      this.isAuthorized(record, authorizationOf)
    );
  }

  /**
   * Whether a UTC day is today or yesterday at `now`: the only days a record
   * is admitted, served or kept for. Any other value, past, future or
   * malformed, is not.
   */
  public isCurrentDay(utcDay: string, now: Date): boolean {
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - ONE_DAY_MS)
      .toISOString()
      .slice(0, 10);

    return utcDay === today || utcDay === yesterday;
  }
}
