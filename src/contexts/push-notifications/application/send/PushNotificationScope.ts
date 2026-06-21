import { NotificationSettingScopeType } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScopeType';

export class PushNotificationScope {
  public readonly channelId?: string;
  public readonly communityId?: string;
  public readonly conversationId?: string;
  public readonly type!:
    | typeof NotificationSettingScopeType.CONVERSATION
    | typeof NotificationSettingScopeType.COMMUNITY_CHANNEL;
}
