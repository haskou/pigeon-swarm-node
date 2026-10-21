import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceSealingRecord } from '@app/contexts/identity-devices/domain/DeviceSealingRecord';

const ONE_DAY_MS = 86_400_000;

export default class DeviceSealingRecordPolicy {
  /**
   * The authorization is a provider, asked last: the day and the signature are
   * cheap, the authorization head is parsed and verified, so a record that
   * fails them never costs that work.
   */
  public admits(
    record: DeviceSealingRecord,
    authorizationOf: () => DeviceAuthorization | undefined,
    now: Date,
  ): boolean {
    if (!this.isCurrentDay(record.getUtcDay(), now)) {
      return false;
    }

    if (!record.hasValidSignature()) {
      return false;
    }
    const authorization = authorizationOf();

    return (
      authorization !== undefined &&
      record.getIdentityId().valueOf() ===
        authorization.getIdentityId().valueOf() &&
      authorization.isAuthorized(record.getDeviceCredential())
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
