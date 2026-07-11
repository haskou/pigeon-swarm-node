export class PushNotificationPayload {
  public readonly body!: string;
  public readonly data!: Record<string, unknown>;
  public readonly tag!: string;
  public readonly tags?: string[];
  public readonly title!: string;
  public readonly type!:
    'call' | 'message' | 'notification' | 'notifications_cleared';
}
