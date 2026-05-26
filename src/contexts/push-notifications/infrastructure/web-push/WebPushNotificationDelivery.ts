import Kernel from '@app/Kernel';
import { createRequire } from 'module';

import { PushNotificationDelivery } from '../../application/send/PushNotificationDelivery';
import { PushNotificationPayload } from '../../application/send/PushNotificationPayload';
import { PushSubscription } from '../../domain/PushSubscription';
import { PushVapidConfiguration } from './PushVapidConfiguration';

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
  private readonly configuration = new PushVapidConfiguration();
  private readonly webPush = this.loadWebPush();
  private hasLoggedDisabledDelivery = false;

  constructor() {
    if (this.isConfigured() && this.webPush) {
      this.configuration.setVapidDetailsWith((subject, publicKey, privateKey) =>
        this.webPush?.setVapidDetails(subject, publicKey, privateKey),
      );
    }
  }

  private loadWebPush(): WebPushModule | undefined {
    try {
      const nodeRequire = createRequire(__filename);

      return nodeRequire('web-push') as WebPushModule;
    } catch {
      Kernel.logger?.warn(
        'Web Push delivery is disabled because the web-push module could not be loaded.',
      );

      return undefined;
    }
  }

  private isGone(error: unknown): boolean {
    const statusCode = (error as WebPushError).statusCode;

    return statusCode === 404 || statusCode === 410;
  }

  private logDisabledDelivery(): void {
    if (this.hasLoggedDisabledDelivery) {
      return;
    }

    this.hasLoggedDisabledDelivery = true;
    Kernel.logger?.warn(
      'Web Push delivery is disabled. Configure PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY to send push notifications.',
    );
  }

  public isConfigured(): boolean {
    return this.configuration.isConfigured();
  }

  public async send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<boolean> {
    if (!this.isConfigured() || !this.webPush) {
      this.logDisabledDelivery();

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
      Kernel.logger?.warn(
        `Web Push delivery failed for endpoint "${primitives.endpoint}": ${String(error)}`,
      );

      return !this.isGone(error);
    }
  }
}
