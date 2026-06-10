import { PushSubscription } from '../../domain/PushSubscription';
import { PushNotificationPayload } from './PushNotificationPayload';
import { PushNotificationDeliveryResult } from './types/PushNotificationDeliveryResult';

export default abstract class PushNotificationDelivery {
  public abstract send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<PushNotificationDeliveryResult>;
}
