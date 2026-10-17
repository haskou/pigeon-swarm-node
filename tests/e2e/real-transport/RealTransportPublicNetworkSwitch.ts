import type { Libp2p } from '@libp2p/interface';

type TopicPubSub = {
  getTopics(): string[];
  subscribe(topic: string): void;
};

function isTopicPubSub(value: unknown): value is TopicPubSub {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getTopics' in value &&
    typeof value.getTopics === 'function' &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  );
}

/**
 * Takes a public libp2p node off the network and back to simulate an outage.
 *
 * A real outage only drops connections: the node keeps its pubsub topics.
 * libp2p.stop() also makes gossipsub forget every subscription, while callers
 * that subscribed once (the relay record directory) still believe they are
 * subscribed and never subscribe again. The switch restores the topics the
 * node had before it went down, so the outage stays faithful to production.
 */
export class RealTransportPublicNetworkSwitch {
  private suspendedTopics = new Set<string>();

  constructor(
    private readonly libp2p: Pick<Libp2p, 'services' | 'start' | 'stop'>,
  ) {}

  private pubsub(): TopicPubSub {
    const pubsub = this.libp2p.services.pubsub;

    if (!isTopicPubSub(pubsub)) {
      throw new Error('Public transport has no pubsub service.');
    }

    return pubsub;
  }

  public async disable(): Promise<void> {
    for (const topic of this.pubsub().getTopics()) {
      this.suspendedTopics.add(topic);
    }

    await this.libp2p.stop();
  }

  public async enable(): Promise<void> {
    await this.libp2p.start();

    const pubsub = this.pubsub();

    for (const topic of this.suspendedTopics) {
      pubsub.subscribe(topic);
    }

    this.suspendedTopics.clear();
  }
}
