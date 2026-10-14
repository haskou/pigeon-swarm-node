/**
 * Everything a push payload carries. It deliberately has no identifier fields:
 * the service worker only needs display text, a type, and opaque group tags.
 */
export class PushNotificationPayload {
  public readonly body!: string;
  public readonly tag!: string;
  public readonly title!: string;
  public readonly type!: 'call' | 'message' | 'notification';
}
