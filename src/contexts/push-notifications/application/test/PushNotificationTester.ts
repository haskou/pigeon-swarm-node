import { PushSubscription } from '../../domain/PushSubscription';
import { PushSubscriptionRepository } from '../../domain/repositories/PushSubscriptionRepository';
import { PushNotificationDelivery } from '../send/PushNotificationDelivery';
import { PushNotificationPayload } from '../send/PushNotificationPayload';
import { PushNotificationDeliveryResult } from '../send/types/PushNotificationDeliveryResult';
import { PushNotificationTestMessage } from './messages/PushNotificationTestMessage';

export class PushNotificationTester {
  constructor(
    private readonly subscriptionRepository: PushSubscriptionRepository,
    private readonly delivery: PushNotificationDelivery,
  ) {}

  private subscriptionsFor(
    message: PushNotificationTestMessage,
    subscriptions: PushSubscription[],
  ): PushSubscription[] {
    const endpoint = message.endpoint;

    if (!endpoint) {
      return subscriptions;
    }

    return subscriptions.filter((subscription) =>
      subscription.getEndpoint().isEqual(endpoint),
    );
  }

  private payload(): PushNotificationPayload {
    return {
      body: 'This is a test push notification.',
      data: {
        test: true,
        timestamp: Date.now(),
      },
      tag: 'push:test',
      title: 'Pigeon test push',
      type: 'notification',
    };
  }

  public async test(
    message: PushNotificationTestMessage,
  ): Promise<PushNotificationDeliveryResult[]> {
    const subscriptions = this.subscriptionsFor(
      message,
      await this.subscriptionRepository.findByIdentityId(message.identityId),
    );
    const payload = this.payload();
    const results: PushNotificationDeliveryResult[] = [];

    for (const subscription of subscriptions) {
      const result = await this.delivery.send(subscription, payload);

      if (result.shouldDeleteSubscription) {
        await this.subscriptionRepository.deleteByEndpoint(
          subscription.getEndpoint(),
        );
      }

      results.push(result);
    }

    return results;
  }
}
