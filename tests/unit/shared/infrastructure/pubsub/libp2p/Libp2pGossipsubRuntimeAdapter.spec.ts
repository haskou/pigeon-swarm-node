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
  const originalPublicBootstrapEnabled =
    process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED;
  const originalPublicBootstrapMultiaddrs =
    process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS;

  afterEach(() => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS = originalBootstrapRelays;
    process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED =
      originalPublicBootstrapEnabled;
    process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS =
      originalPublicBootstrapMultiaddrs;
    Libp2pGossipsubRuntimeAdapter.clearSharedNodeForTesting();
    jest.clearAllMocks();
  });

  it('should append public bootstrap addresses by default', async () => {
    delete process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;
    delete process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED;
    delete process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS;

    await new Libp2pGossipsubRuntimeAdapter().createNode();

    expect(bootstrap).toHaveBeenCalledWith({
      list: [
        '/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
        '/dnsaddr/sg1.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
        '/dnsaddr/ny5.bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
        '/dnsaddr/sv15.bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      ],
      tagName: 'pigeon-public-bootstrap',
      tagTTL: Infinity,
    });
    expect(createLibp2p).toHaveBeenCalledWith(
      expect.objectContaining({
        peerDiscovery: [
          'existing-discovery',
          {
            config: expect.objectContaining({
              tagName: 'pigeon-public-bootstrap',
            }),
            type: 'bootstrap-discovery',
          },
        ],
        transports: [expect.any(Function)],
      }),
    );
  });

  it('should append configured relay bootstrap addresses after public bootstrap addresses', async () => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS =
      ' /dns4/relay-a.test/tcp/4011/p2p/12D3A, /dns4/relay-b.test/tcp/4011/p2p/12D3B ';
    process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS =
      '/dns4/public-bootstrap.test/tcp/4001/p2p/12D3Public';

    await new Libp2pGossipsubRuntimeAdapter().createNode();

    expect(bootstrap).toHaveBeenCalledWith({
      list: ['/dns4/public-bootstrap.test/tcp/4001/p2p/12D3Public'],
      tagName: 'pigeon-public-bootstrap',
      tagTTL: Infinity,
    });
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
              list: ['/dns4/public-bootstrap.test/tcp/4001/p2p/12D3Public'],
              tagName: 'pigeon-public-bootstrap',
              tagTTL: Infinity,
            },
            type: 'bootstrap-discovery',
          },
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
        transports: [expect.any(Function)],
      }),
    );
  });

  it('should allow disabling public bootstrap for isolated tests', async () => {
    delete process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;
    process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';

    await new Libp2pGossipsubRuntimeAdapter().createNode();

    expect(bootstrap).not.toHaveBeenCalled();
    expect(createLibp2p).toHaveBeenCalledWith(
      expect.objectContaining({
        peerDiscovery: ['existing-discovery'],
      }),
    );
  });
});
