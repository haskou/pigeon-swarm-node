import { Enum } from '@haskou/value-objects';

import { InvalidPresenceStatusError } from '../errors/InvalidPresenceStatusError';
import { presenceStatuses } from './types/PresenceStatuses';
import { PresenceStatusValue } from './types/PresenceStatusValue';

export { PresenceStatusValue } from './types/PresenceStatusValue';

export class PresenceStatus extends Enum<PresenceStatusValue> {
  public static readonly AVAILABLE = new PresenceStatus(
    presenceStatuses.AVAILABLE,
  );

  public static readonly AWAY = new PresenceStatus(presenceStatuses.AWAY);

  public static readonly BUSY = new PresenceStatus(presenceStatuses.BUSY);

  public static readonly CUSTOM = new PresenceStatus(presenceStatuses.CUSTOM);

  public static readonly DISCONNECTED = new PresenceStatus(
    presenceStatuses.DISCONNECTED,
  );

  public static readonly INVISIBLE = new PresenceStatus(
    presenceStatuses.INVISIBLE,
  );

  public static fromPrimitives(value: string): PresenceStatus {
    switch (value) {
      case presenceStatuses.AVAILABLE:
        return PresenceStatus.AVAILABLE;
      case presenceStatuses.AWAY:
        return PresenceStatus.AWAY;
      case presenceStatuses.BUSY:
        return PresenceStatus.BUSY;
      case presenceStatuses.CUSTOM:
        return PresenceStatus.CUSTOM;
      case presenceStatuses.DISCONNECTED:
        return PresenceStatus.DISCONNECTED;
      case presenceStatuses.INVISIBLE:
        return PresenceStatus.INVISIBLE;
      default:
        throw new InvalidPresenceStatusError(value);
    }
  }

  public getValues(): PresenceStatusValue[] {
    return Object.values(presenceStatuses);
  }

  public blocksDerivedStatus(): boolean {
    return this.isBusy() || this.isCustom() || this.isInvisible();
  }

  public canBeSelected(): boolean {
    return !this.isDisconnected();
  }

  public isAvailable(): boolean {
    return this.isEqual(PresenceStatus.AVAILABLE);
  }

  public isAway(): boolean {
    return this.isEqual(PresenceStatus.AWAY);
  }

  public isBusy(): boolean {
    return this.isEqual(PresenceStatus.BUSY);
  }

  public isCustom(): boolean {
    return this.isEqual(PresenceStatus.CUSTOM);
  }

  public isDisconnected(): boolean {
    return this.isEqual(PresenceStatus.DISCONNECTED);
  }

  public isInvisible(): boolean {
    return this.isEqual(PresenceStatus.INVISIBLE);
  }

  public visibleForOthers(): PresenceStatus {
    if (this.isInvisible()) {
      return PresenceStatus.DISCONNECTED;
    }

    return this;
  }
}
