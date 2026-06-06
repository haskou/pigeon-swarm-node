import { PushSubscription } from '../../domain/PushSubscription';
import { PushNotificationPayload } from './PushNotificationPayload';
import { PushNotificationDeliveryResult } from './types/PushNotificationDeliveryResult';

export interface PushNotificationDelivery {
  send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<PushNotificationDeliveryResult>;
}
