export type MongoNotificationSettingScopeDocument = {
  channelId?: string;
  communityId?: string;
  conversationId?: string;
  type: string;
};

export type MongoNotificationScopeSettingsDocument = {
  _id: string;
  hideMutedChannels: boolean;
  identityId: string;
  mobilePushEnabled: boolean;
  mutedUntil?: number | null;
  notificationLevel: string;
  scope: MongoNotificationSettingScopeDocument;
  scopeKey: string;
  suppressEveryoneAndHere: boolean;
  suppressRoleMentions: boolean;
  updatedAt: number;
};
