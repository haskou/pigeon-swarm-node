export type NotificationScopeSettingsResource = {
  hideMutedChannels: boolean;
  mobilePushEnabled: boolean;
  mutedUntil?: number | null;
  notificationLevel: string;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  suppressEveryoneAndHere: boolean;
  suppressRoleMentions: boolean;
  updatedAt: number;
};
