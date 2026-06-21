export class NotificationSettingsWereUpdatedAttributes {
  [key: string]: unknown;

  public readonly hideMutedChannels?: boolean;
  public readonly identityId?: string;
  public readonly mobilePushEnabled?: boolean;
  public readonly mutedUntil?: number | null;
  public readonly notificationLevel?: string;
  public readonly scope?: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };

  public readonly scopeKey?: string;
  public readonly suppressEveryoneAndHere?: boolean;
  public readonly suppressRoleMentions?: boolean;
}
