import { PushSubscription } from '../../domain/PushSubscription';
import { PushNotificationPayload } from './PushNotificationPayload';

export interface PushNotificationDelivery {
  send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<boolean>;
}
