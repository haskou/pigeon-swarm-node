export type NotificationSettingsWereResetAttributes = {
  identityId: string;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  scopeKey: string;
};
