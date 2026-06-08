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
  '@libp2p/gossipsub',
  () => ({
    gossipsub: jest.fn((config) => ({
      config,
      type: 'gossipsub-service',
    })),
  }),
  { virtual: true },
);

const bootstrapMock = jest.fn((config) => ({
  config,
  type: 'bootstrap-discovery',
}));

jest.mock(
  '@libp2p/bootstrap',
  () => ({
    bootstrap: bootstrapMock,
  }),
  { virtual: true },
);

import { HeliaRuntimeAdapter } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

describe('HeliaRuntimeAdapter', () => {
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
    jest.clearAllMocks();
  });

  it('should use concrete public bootstrap peers by default', async () => {
    delete process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED;
    delete process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS;

    const defaults = (await new HeliaRuntimeAdapter().getLibp2pDefaults()) as {
      peerDiscovery?: unknown[];
    };

    expect(defaults.peerDiscovery).toContain('existing-discovery');
    expect(bootstrapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        list: expect.arrayContaining([
          expect.stringContaining('/p2p/'),
        ]),
      }),
    );
    expect(
      bootstrapMock.mock.calls[0][0].list.every((multiaddr: string) =>
        multiaddr.includes('/p2p/'),
      ),
    ).toBe(true);
  });

  it('should not treat relay bootstrap addresses as public IPFS bootstrap addresses', async () => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS =
      ' /dns4/relay-a.test/tcp/4011/p2p/12D3A, /dns4/relay-b.test/tcp/4011/p2p/12D3B ';
    process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';

    const defaults = (await new HeliaRuntimeAdapter().getLibp2pDefaults()) as {
      peerDiscovery?: unknown[];
    };

    expect(defaults.peerDiscovery).toEqual(['existing-discovery']);
  });

  it('should add explicit relay bootstrap addresses when requested by private runtimes', async () => {
    process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS =
      ' /dns4/relay-a.test/tcp/4011/p2p/12D3A, /dns4/relay-b.test/tcp/4011/p2p/12D3B ';

    const defaults = await new HeliaRuntimeAdapter().withBootstrapRelays({
      peerDiscovery: ['existing-discovery'],
    });

    expect(defaults.peerDiscovery).toContain('existing-discovery');
    expect(bootstrapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        list: [
          '/dns4/relay-a.test/tcp/4011/p2p/12D3A',
          '/dns4/relay-b.test/tcp/4011/p2p/12D3B',
        ],
        tagName: 'pigeon-relay-bootstrap',
        tagTTL: Infinity,
      }),
    );
  });
});
