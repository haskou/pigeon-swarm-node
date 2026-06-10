import Kernel from '@app/Kernel';

import PubSubTransport from '../PubSubTransport';
import Libp2pGossipsubRuntimeAdapter from './Libp2pGossipsubRuntimeAdapter';
import { Libp2pPubSubNode } from './Libp2pPubSubNode';
import { PubSubEvent } from './PubSubEvent';

export default class Libp2pGossipsubTransport extends PubSubTransport {
  private nodePromise?: Promise<Libp2pPubSubNode>;

  constructor(private readonly runtimeAdapter: Libp2pGossipsubRuntimeAdapter) {
    super();
  }

  private async getNode(): Promise<Libp2pPubSubNode> {
    this.nodePromise ??= this.runtimeAdapter.createNode();

    return this.nodePromise;
  }

  private getPubSubMessage(event: PubSubEvent): {
    data?: Uint8Array;
    topic?: string;
  } {
    return event.detail.msg || event.detail;
  }

  private async handleEvent(
    topic: string,
    handler: (payload: string) => Promise<void>,
    event: PubSubEvent,
  ): Promise<void> {
    const message = this.getPubSubMessage(event);

    if (message.topic !== topic || !message.data) {
      return;
    }

    await handler(new TextDecoder().decode(message.data));
  }

  public async publish(topic: string, payload: string): Promise<void> {
    const node = await this.getNode();

    try {
      await node.services.pubsub.publish(
        topic,
        new TextEncoder().encode(payload),
      );
    } catch (error: unknown) {
      Kernel.logger.warn(
        `PubSub publish failed for topic "${topic}": ${String(error)}`,
      );
    }
  }

  public async subscribe(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void> {
    const node = await this.getNode();
    const listener = (event: PubSubEvent): void => {
      this.handleEvent(topic, handler, event).catch((error: unknown) => {
        Kernel.logger.error(
          `PubSub handler failed for topic "${topic}": ${String(error)}`,
        );
      });
    };

    await node.services.pubsub.subscribe(topic);
    node.services.pubsub.addEventListener('message', listener);
    node.services.pubsub.addEventListener('gossipsub:message', listener);
  }
}
