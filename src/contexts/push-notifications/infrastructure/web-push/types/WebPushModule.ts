import { WebPushSendResult } from './WebPushSendResult';
import { WebPushSubscription } from './WebPushSubscription';

export type WebPushModule = {
  sendNotification(
    subscription: WebPushSubscription,
    payload: string,
  ): Promise<WebPushSendResult>;
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
};
