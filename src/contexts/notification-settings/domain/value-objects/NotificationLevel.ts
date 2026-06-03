import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNotificationLevelError } from '../errors/InvalidNotificationLevelError';

export class NotificationLevel extends StringValueObject {
  private static readonly VALID_VALUES = ['all', 'mentions', 'none'];

  public static readonly ALL = 'all';

  public static readonly MENTIONS = 'mentions';

  public static readonly NONE = 'none';

  constructor(value: string) {
    super(value);
    assert(
      NotificationLevel.VALID_VALUES.includes(value),
      new InvalidNotificationLevelError(value),
    );
  }

  public allowsAll(): boolean {
    return this.valueOf() === NotificationLevel.ALL;
  }

  public allowsMentionsOnly(): boolean {
    return this.valueOf() === NotificationLevel.MENTIONS;
  }

  public blocksAll(): boolean {
    return this.valueOf() === NotificationLevel.NONE;
  }
}
