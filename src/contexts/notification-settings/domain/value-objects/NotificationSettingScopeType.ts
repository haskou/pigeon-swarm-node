import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNotificationSettingScopeTypeError } from '../errors/InvalidNotificationSettingScopeTypeError';

export class NotificationSettingScopeType extends StringValueObject {
  private static readonly VALID_VALUES = [
    'conversation',
    'community',
    'community_channel',
  ];

  public static readonly CONVERSATION = 'conversation';

  public static readonly COMMUNITY = 'community';

  public static readonly COMMUNITY_CHANNEL = 'community_channel';

  constructor(value: string) {
    super(value);
    assert(
      NotificationSettingScopeType.VALID_VALUES.includes(value),
      new InvalidNotificationSettingScopeTypeError(value),
    );
  }

  public isCommunityChannel(): boolean {
    return this.valueOf() === NotificationSettingScopeType.COMMUNITY_CHANNEL;
  }

  public isCommunity(): boolean {
    return this.valueOf() === NotificationSettingScopeType.COMMUNITY;
  }

  public isConversation(): boolean {
    return this.valueOf() === NotificationSettingScopeType.CONVERSATION;
  }
}
