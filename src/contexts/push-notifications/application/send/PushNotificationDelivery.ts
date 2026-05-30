import { PushSubscription } from '../../domain/PushSubscription';
import { PushNotificationPayload } from './PushNotificationPayload';

export type PushNotificationDeliveryResult = {
  body?: string;
  delivered: boolean;
  endpoint: string;
  endpointHost: string;
  error?: string;
  shouldDeleteSubscription: boolean;
  statusCode?: number;
};

export interface PushNotificationDelivery {
  send(
    subscription: PushSubscription,
    payload: PushNotificationPayload,
  ): Promise<PushNotificationDeliveryResult>;
}
