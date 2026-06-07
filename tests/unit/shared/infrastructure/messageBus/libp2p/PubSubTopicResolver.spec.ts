import PubSubTopicResolver from '@app/shared/infrastructure/messageBus/libp2p/PubSubTopicResolver';
import { PrivateKey } from '@haskou/value-objects';

describe('PubSubTopicResolver', () => {
  it('should derive private fallback topics without exposing network ids', () => {
    const resolver = new PubSubTopicResolver();
    const topic = resolver.fromRoutingKeyForPrivateNetworkFallback(
      'identities.v1.identity.was_created',
      mockNetworkKey('first-private-key'),
    );

    expect(topic).toMatch(
      /^pigeon-swarm\.private-relay\.identities\.v1\.[A-Za-z0-9_-]+$/,
    );
    expect(topic).not.toContain('private-network-id');
    expect(topic).not.toContain('first-private-key');
  });

  it('should derive different fallback topics for different private keys', () => {
    const resolver = new PubSubTopicResolver();

    expect(
      resolver.fromRoutingKeyForPrivateNetworkFallback(
        'identities.v1.identity.was_created',
        mockNetworkKey('first-private-key'),
      ),
    ).not.toBe(
      resolver.fromRoutingKeyForPrivateNetworkFallback(
        'identities.v1.identity.was_created',
        mockNetworkKey('second-private-key'),
      ),
    );
  });
});

function mockNetworkKey(value: string): PrivateKey {
  return {
    valueOf: () => value,
  } as PrivateKey;
}
