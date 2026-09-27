import { assert, Integer } from '@haskou/value-objects';

import { NotificationSettingsStorageCapacityExceededError } from './errors/NotificationSettingsStorageCapacityExceededError';

export class NotificationSettingsStorageQuota {
  private static readonly MAX_IDENTITY_SETTINGS = new Integer(256);
  private static readonly MAX_NODE_SETTINGS = new Integer(4096);

  public constructor(
    private readonly nodeSettings: Integer,
    private readonly identitySettings: Integer,
  ) {}

  private afterReservation(settings: Integer): Integer {
    return new Integer(settings.valueOf() + 1);
  }

  public reserve(): void {
    assert(
      this.afterReservation(this.nodeSettings).isLessOrEqualThan(
        NotificationSettingsStorageQuota.MAX_NODE_SETTINGS,
      ) &&
        this.afterReservation(this.identitySettings).isLessOrEqualThan(
          NotificationSettingsStorageQuota.MAX_IDENTITY_SETTINGS,
        ),
      new NotificationSettingsStorageCapacityExceededError(),
    );
  }
}
