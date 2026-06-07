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
  'libp2p',
  () => ({
    createLibp2p: jest.fn(async (config) => ({
      config,
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
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

jest.mock('@app/shared/infrastructure/network/NetworkDiagnosticsLogger', () => ({
  __esModule: true,
  default: {
    attachConnectionEvents: jest.fn(),
    logStartup: jest.fn(),
  },
}));

import { bootstrap } from '@libp2p/bootstrap';
import { createLibp2p } from 'libp2p';

import { Libp2pGossipsubRuntimeAdapter } from '../../../../../../src/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubRuntimeAdapter';

describe('Libp2pGossipsubRuntimeAdapter', () => {
  const originalBootstrapRelays = process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;

  afterEach(() => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS = originalBootstrapRelays;
    Libp2pGossipsubRuntimeAdapter.clearSharedNodeForTesting();
    jest.clearAllMocks();
  });

  it('should append configured public relay bootstrap addresses', async () => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS =
      ' /dns4/relay-a.test/tcp/4011/p2p/12D3A, /dns4/relay-b.test/tcp/4011/p2p/12D3B ';

    await new Libp2pGossipsubRuntimeAdapter().createNode();

    expect(bootstrap).toHaveBeenCalledWith({
      list: [
        '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
        '/dns4/relay-b.test/tcp/4011/p2p/12D3B',
      ],
      tagName: 'pigeon-relay-bootstrap',
      tagTTL: Infinity,
    });
    expect(createLibp2p).toHaveBeenCalledWith(
      expect.objectContaining({
        peerDiscovery: [
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
        ],
        transports: [
          expect.any(Function),
        ],
      }),
    );
  });
});
