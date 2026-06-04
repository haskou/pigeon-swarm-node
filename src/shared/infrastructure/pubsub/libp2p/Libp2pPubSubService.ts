import { PubSubEvent } from './PubSubEvent';

export type Libp2pPubSubService = {
  addEventListener(
    eventName: string,
    handler: (event: PubSubEvent) => void,
  ): void;
  publish(topic: string, payload: Uint8Array): Promise<unknown>;
  subscribe(topic: string): Promise<void> | void;
};
