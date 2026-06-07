import Kernel from '@app/Kernel';
import { createRequire } from 'module';

import { PushNotificationDelivery } from '../../application/send/PushNotificationDelivery';
import { PushNotificationPayload } from '../../application/send/PushNotificationPayload';
import { PushNotificationDeliveryResult } from '../../application/send/types/PushNotificationDeliveryResult';
import { PushSubscription } from '../../domain/PushSubscription';
import { PushVapidConfiguration } from './PushVapidConfiguration';
import { WebPushError } from './types/WebPushError';
import { WebPushModule } from './types/WebPushModule';
import { WebPushSendResult } from './types/WebPushSendResult';

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

  private endpointHost(endpoint: string): string {
    try {
      return new URL(endpoint).host;
    } catch {
      return 'unknown';
    }
  }

  private disabledDeliveryResult(
    endpoint: string,
  ): PushNotificationDeliveryResult {
    return {
      delivered: false,
      endpoint,
      endpointHost: this.endpointHost(endpoint),
      error: 'Web Push delivery is disabled.',
      shouldDeleteSubscription: false,
    };
  }

  private successDeliveryResult(
    endpoint: string,
    sendResult: WebPushSendResult,
  ): PushNotificationDeliveryResult {
    return {
      delivered: true,
      endpoint,
      endpointHost: this.endpointHost(endpoint),
      shouldDeleteSubscription: false,
      statusCode: sendResult.statusCode,
    };
  }

  private failedDeliveryResult(
    endpoint: string,
    error: unknown,
  ): PushNotificationDeliveryResult {
    return {
      delivered: false,
      endpoint,
      endpointHost: this.endpointHost(endpoint),
      error: 'Web Push delivery failed.',
      shouldDeleteSubscription: this.isGone(error),
      statusCode: (error as WebPushError).statusCode,
    };
  }

  private logFailedDelivery(result: PushNotificationDeliveryResult): void {
    Kernel.logger?.warn(
      JSON.stringify({
        endpoint: result.endpoint,
        endpointHost: result.endpointHost,
        error: result.error,
        message: 'Web Push delivery failed.',
        shouldDeleteSubscription: result.shouldDeleteSubscription,
        statusCode: result.statusCode,
      }),
    );
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
  ): Promise<PushNotificationDeliveryResult> {
    const primitives = subscription.toPrimitives();

    if (!this.isConfigured() || !this.webPush) {
      this.logDisabledDelivery();

      return this.disabledDeliveryResult(primitives.endpoint);
    }

    try {
      const sendResult = await this.webPush.sendNotification(
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

      return this.successDeliveryResult(primitives.endpoint, sendResult);
    } catch (error: unknown) {
      const result = this.failedDeliveryResult(primitives.endpoint, error);

      this.logFailedDelivery(result);

      return result;
    }
  }
}
