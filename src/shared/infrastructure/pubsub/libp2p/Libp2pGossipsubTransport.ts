import Kernel from '@app/Kernel';

import NetworkDiagnosticsLogger from '../../network/NetworkDiagnosticsLogger';
import { PubSubTransport } from '../PubSubTransport';
import runtime, {
  Libp2pGossipsubRuntimeAdapter,
} from './Libp2pGossipsubRuntimeAdapter';
import { Libp2pPubSubNode } from './Libp2pPubSubNode';
import { PubSubEvent } from './PubSubEvent';

export default class Libp2pGossipsubTransport implements PubSubTransport {
  private nodePromise?: Promise<Libp2pPubSubNode>;

  constructor(
    private readonly runtimeAdapter: Libp2pGossipsubRuntimeAdapter = runtime,
  ) {}

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

    NetworkDiagnosticsLogger.logPubSub('received', await this.getNode(), {
      mode: 'public',
      name: 'standalone-gossipsub',
      payloadBytes: message.data.byteLength,
      topic,
    });

    await handler(new TextDecoder().decode(message.data));
  }

  public async publish(topic: string, payload: string): Promise<void> {
    const node = await this.getNode();
    const payloadBytes = new TextEncoder().encode(payload);

    NetworkDiagnosticsLogger.logPubSub('publish', node, {
      mode: 'public',
      name: 'standalone-gossipsub',
      payloadBytes: payloadBytes.byteLength,
      topic,
    });

    try {
      await node.services.pubsub.publish(topic, payloadBytes);
    } catch (error: unknown) {
      NetworkDiagnosticsLogger.logPubSub('publish-failed', node, {
        error,
        mode: 'public',
        name: 'standalone-gossipsub',
        payloadBytes: payloadBytes.byteLength,
        topic,
      });
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
    NetworkDiagnosticsLogger.logPubSub('subscribe', node, {
      mode: 'public',
      name: 'standalone-gossipsub',
      topic,
    });
    node.services.pubsub.addEventListener('message', listener);
    node.services.pubsub.addEventListener('gossipsub:message', listener);
  }
}
