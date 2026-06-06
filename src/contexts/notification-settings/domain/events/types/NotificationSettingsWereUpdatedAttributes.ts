export type NotificationSettingsWereUpdatedAttributes = {
  hideMutedChannels: boolean;
  identityId: string;
  mobilePushEnabled: boolean;
  mutedUntil?: number | null;
  notificationLevel: string;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  scopeKey: string;
  suppressEveryoneAndHere: boolean;
  suppressRoleMentions: boolean;
};
