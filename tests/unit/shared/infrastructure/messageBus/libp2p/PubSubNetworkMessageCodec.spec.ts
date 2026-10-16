import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import PubSubNetworkMessageCodec from '@app/shared/infrastructure/messageBus/libp2p/PubSubNetworkMessageCodec';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/private-network.json';
import { mock } from 'jest-mock-extended';

describe('PubSubNetworkMessageCodec', () => {
  const codec = new PubSubNetworkMessageCodec();
  const { pubsub } = vectors;

  const network = (key?: string, networkId = pubsub.networkId): IPFSNetwork => {
    const config = new IPFSNetworkConfig(
      networkId,
      'network',
      key ? new PrivateKey(key) : undefined,
    );

    return mock<IPFSNetwork>({
      getConfig: () => config,
      getId: () => config.getId(),
      isPrivate: () => config.isPrivate(),
    });
  };

  const privateNetwork = network(vectors.keys.network.privateKeyPem);

  it('opens the library pubsub vector on a private network', () => {
    expect(codec.decode(pubsub.envelope, privateNetwork, pubsub.topic)).toBe(
      pubsub.payload,
    );
  });

  it('seals private network payloads into the versioned envelope', () => {
    const encoded = codec.encode(pubsub.payload, privateNetwork, pubsub.topic);

    expect(Object.keys(JSON.parse(encoded))).toEqual([
      'ciphertext',
      'nonce',
      'version',
    ]);
    expect(codec.decode(encoded, privateNetwork, pubsub.topic)).toBe(
      pubsub.payload,
    );
  });

  it('rejects a cleartext envelope on a private network', () => {
    const cleartext = JSON.stringify({
      encrypted: false,
      payload: pubsub.payload,
    });

    expect(() =>
      codec.decode(cleartext, privateNetwork, pubsub.topic),
    ).toThrow();
  });

  it('rejects an envelope sealed for another topic', () => {
    expect(() =>
      codec.decode(pubsub.envelope, privateNetwork, `${pubsub.topic}.other`),
    ).toThrow();
  });

  it.each(pubsub.invalid)('rejects the $name vector', (invalid) => {
    const key =
      invalid.key === 'other'
        ? vectors.keys.other.privateKeyPem
        : vectors.keys.network.privateKeyPem;

    expect(() =>
      codec.decode(
        invalid.envelope,
        network(key, invalid.networkId),
        invalid.topic,
      ),
    ).toThrow();
  });

  it('keeps public network payloads in the clear envelope', () => {
    const publicNetwork = network();
    const encoded = codec.encode(pubsub.payload, publicNetwork, pubsub.topic);

    expect(JSON.parse(encoded)).toEqual({
      encrypted: false,
      payload: pubsub.payload,
    });
    expect(codec.decode(encoded, publicNetwork, pubsub.topic)).toBe(
      pubsub.payload,
    );
  });

  it.each([
    '{"encrypted":true,"payload":"x"}',
    '{"encrypted":false,"payload":"x","extra":1}',
    '{"encrypted":false}',
    '[]',
    'null',
  ])('rejects the malformed public envelope %s', (envelope) => {
    expect(() => codec.decode(envelope, network(), pubsub.topic)).toThrow();
  });
});
