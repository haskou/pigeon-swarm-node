import { NotificationSettingScopeType } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScopeType';

export type PushNotificationScope =
  | {
      conversationId: string;
      type: typeof NotificationSettingScopeType.CONVERSATION;
    }
  | {
      channelId: string;
      communityId: string;
      type: typeof NotificationSettingScopeType.COMMUNITY_CHANNEL;
    };
