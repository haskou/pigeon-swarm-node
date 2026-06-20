import { PushSubscription } from '../../domain/PushSubscription';
import { PushNotificationDeliveryResult } from './PushNotificationDeliveryResult';
import { PushNotificationPayload } from './PushNotificationPayload';

export default abstract class PushNotificationDelivery {
  public abstract send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<PushNotificationDeliveryResult>;
}
