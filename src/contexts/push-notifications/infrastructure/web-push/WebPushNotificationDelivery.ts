import { createRequire } from 'module';

import { PushNotificationDelivery } from '../../application/send/PushNotificationDelivery';
import { PushNotificationPayload } from '../../application/send/PushNotificationPayload';
import { PushSubscription } from '../../domain/PushSubscription';

type WebPushError = Error & {
  statusCode?: number;
};

type WebPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

type WebPushModule = {
  sendNotification(
    subscription: WebPushSubscription,
    payload: string,
  ): Promise<void>;
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
};

export class WebPushNotificationDelivery implements PushNotificationDelivery {
  private readonly publicKey = process.env.PUSH_VAPID_PUBLIC_KEY || '';
  private readonly privateKey = process.env.PUSH_VAPID_PRIVATE_KEY || '';
  private readonly subject =
    process.env.PUSH_VAPID_SUBJECT || 'mailto:admin@localhost';

  private readonly webPush = this.loadWebPush();

  constructor() {
    if (this.isConfigured() && this.webPush) {
      this.webPush.setVapidDetails(
        this.subject,
        this.publicKey,
        this.privateKey,
      );
    }
  }

  private loadWebPush(): WebPushModule | undefined {
    try {
      const nodeRequire = createRequire(__filename);

      return nodeRequire('web-push') as WebPushModule;
    } catch {
      return undefined;
    }
  }

  private isGone(error: unknown): boolean {
    const statusCode = (error as WebPushError).statusCode;

    return statusCode === 404 || statusCode === 410;
  }

  public isConfigured(): boolean {
    return this.publicKey.length > 0 && this.privateKey.length > 0;
  }

  public async send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<boolean> {
    if (!this.isConfigured() || !this.webPush) {
      return true;
    }

    const primitives = subscription.toPrimitives();

    try {
      await this.webPush.sendNotification(
        {
          endpoint: primitives.endpoint,
          expirationTime: primitives.expirationTime ?? null,
          keys: {
            auth: primitives.auth,
            p256dh: primitives.p256dh,
          },
        },
        JSON.stringify(payload),
      );

      return true;
    } catch (error: unknown) {
      return !this.isGone(error);
    }
  }
}
