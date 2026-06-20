export class NotificationSettingsWereResetAttributes {
  [key: string]: unknown;

  public readonly identityId?: string;
  public readonly scope?: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };

  public readonly scopeKey?: string;
}
