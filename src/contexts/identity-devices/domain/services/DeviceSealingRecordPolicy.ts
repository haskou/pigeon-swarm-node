import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceSealingRecord } from '@app/contexts/identity-devices/domain/DeviceSealingRecord';

const ONE_DAY_MS = 86_400_000;

export default class DeviceSealingRecordPolicy {
  public admits(
    record: DeviceSealingRecord,
    authorization: DeviceAuthorization | undefined,
    now: Date,
  ): boolean {
    if (!authorization) {
      return false;
    }
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - ONE_DAY_MS)
      .toISOString()
      .slice(0, 10);

    return (
      (record.getUtcDay() === today || record.getUtcDay() === yesterday) &&
      record.getIdentityId().valueOf() ===
        authorization.getIdentityId().valueOf() &&
      authorization.isAuthorized(record.getDeviceCredential()) &&
      record.hasValidSignature()
    );
  }
}
