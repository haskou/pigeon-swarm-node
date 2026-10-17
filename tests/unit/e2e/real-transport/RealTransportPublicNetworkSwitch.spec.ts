import type { Libp2p } from '@libp2p/interface';

import { mock } from 'jest-mock-extended';

import { RealTransportPublicNetworkSwitch } from '../../../e2e/real-transport/RealTransportPublicNetworkSwitch';

type TopicPubSub = {
  getTopics(): string[];
  subscribe(topic: string): void;
};

describe('RealTransportPublicNetworkSwitch', () => {
  function startedLibp2p(initialTopics: string[]): {
    libp2p: Libp2p;
    pubsub: TopicPubSub;
  } {
    // Mirrors gossipsub: stop() forgets every subscription, start() does not restore them.
    let topics = [...initialTopics];
    const pubsub = mock<TopicPubSub>();
    const libp2p = mock<Libp2p>();

    pubsub.getTopics.mockImplementation(() => [...topics]);
    pubsub.subscribe.mockImplementation((topic) => {
      topics = [...topics, topic];
    });
    libp2p.stop.mockImplementation(() => {
      topics = [];

      return Promise.resolve();
    });
    libp2p.start.mockImplementation(() => Promise.resolve());
    Reflect.set(libp2p, 'services', { pubsub });

    return { libp2p, pubsub };
  }

  it('should keep the pubsub topics a public node had before a simulated outage', async () => {
    const { libp2p, pubsub } = startedLibp2p([
      'pigeon/relay-records/network',
      'pigeon/relay-records/network.request',
    ]);
    const publicNetwork = new RealTransportPublicNetworkSwitch(libp2p);

    await publicNetwork.disable();
    await publicNetwork.enable();

    expect(libp2p.stop).toHaveBeenCalledTimes(1);
    expect(libp2p.start).toHaveBeenCalledTimes(1);
    expect(pubsub.getTopics()).toEqual([
      'pigeon/relay-records/network',
      'pigeon/relay-records/network.request',
    ]);
  });

  it('should not resubscribe topics after a node that was never disabled starts', async () => {
    const { libp2p, pubsub } = startedLibp2p([]);
    const publicNetwork = new RealTransportPublicNetworkSwitch(libp2p);

    await publicNetwork.enable();

    expect(libp2p.start).toHaveBeenCalledTimes(1);
    expect(pubsub.subscribe).not.toHaveBeenCalled();
  });
});
