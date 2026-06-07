import { PushNotificationDeliveryResult } from '@app/contexts/push-notifications/application/send/types/PushNotificationDeliveryResult';

import { PushTestResource } from '../resources/PushTestResource';

export class PushTestViewModel {
  constructor(private readonly results: PushNotificationDeliveryResult[]) {}

  public toResource(): PushTestResource {
    return {
      deliveries: this.results.map((result) => ({
        delivered: result.delivered,
        endpoint: result.endpoint,
        endpointHost: result.endpointHost,
        error: result.error,
        removed: result.shouldDeleteSubscription,
        statusCode: result.statusCode,
      })),
    };
  }
}
