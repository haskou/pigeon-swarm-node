jest.mock(
  'helia',
  () => ({
    libp2pDefaults: jest.fn(() => ({
      addresses: { listen: ['/ip4/0.0.0.0/tcp/4001'] },
      peerDiscovery: ['existing-discovery'],
      services: {},
      transports: [() => 'tcp'],
    })),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/bootstrap',
  () => ({
    bootstrap: jest.fn((config) => ({
      config,
      type: 'bootstrap-discovery',
    })),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/gossipsub',
  () => ({
    gossipsub: jest.fn((config) => ({
      config,
      type: 'gossipsub-service',
    })),
  }),
  { virtual: true },
);

import { bootstrap } from '@libp2p/bootstrap';

import { HeliaRuntimeAdapter } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

describe('HeliaRuntimeAdapter', () => {
  const originalBootstrapRelays = process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;

  afterEach(() => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS = originalBootstrapRelays;
    jest.clearAllMocks();
  });

  it('should keep existing discovery when bootstrap relays are not configured', async () => {
    delete process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;

    const defaults = (await new HeliaRuntimeAdapter().getLibp2pDefaults()) as {
      peerDiscovery?: unknown[];
    };

    expect(defaults.peerDiscovery).toEqual(['existing-discovery']);
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('should append configured bootstrap relays to libp2p defaults', async () => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS =
      ' /dns4/relay-a.test/tcp/4011/p2p/12D3A, /dns4/relay-b.test/tcp/4011/p2p/12D3B ';

    const defaults = (await new HeliaRuntimeAdapter().getLibp2pDefaults()) as {
      peerDiscovery?: unknown[];
    };

    expect(bootstrap).toHaveBeenCalledWith({
      list: [
        '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
        '/dns4/relay-b.test/tcp/4011/p2p/12D3B',
      ],
      tagName: 'pigeon-relay-bootstrap',
      tagTTL: Infinity,
    });
    expect(defaults.peerDiscovery).toEqual([
      'existing-discovery',
      {
        config: {
          list: [
            '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
            '/dns4/relay-b.test/tcp/4011/p2p/12D3B',
          ],
          tagName: 'pigeon-relay-bootstrap',
          tagTTL: Infinity,
        },
        type: 'bootstrap-discovery',
      },
    ]);
  });
});
