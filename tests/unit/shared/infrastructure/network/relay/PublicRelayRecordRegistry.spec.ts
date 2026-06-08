import { PublicRelayRecordRegistry } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordRegistry';

describe('PublicRelayRecordRegistry', () => {
  it('should keep active relay records and prune expired ones', () => {
    const registry = new PublicRelayRecordRegistry();

    registry.clear();
    registry.save({
      expiresAt: 2000,
      issuedAt: 1000,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay',
      signature: 'signature',
      version: 1,
    });

    expect(registry.multiaddrs(1500)).toEqual([
      '/dns4/relay.test/tcp/4011/p2p/12D3Relay',
    ]);

    registry.pruneExpired(2500);

    expect(registry.all(2500)).toEqual([]);
  });

  it('should notify listeners when a relay record is saved', async () => {
    const registry = new PublicRelayRecordRegistry();
    const listener = jest.fn(async (): Promise<void> => undefined);
    const record = {
      expiresAt: 2000,
      issuedAt: 1000,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay' as const,
      signature: 'signature',
      version: 1 as const,
    };

    registry.clear();
    registry.onRecordSaved(listener);
    registry.save(record);
    await new Promise((resolve) => setImmediate(resolve));

    expect(listener).toHaveBeenCalledWith(record);
  });

  it('should not notify listeners when only the relay record expiry is refreshed', async () => {
    const registry = new PublicRelayRecordRegistry();
    const listener = jest.fn(async (): Promise<void> => undefined);
    const record = {
      expiresAt: Date.now() + 1000,
      issuedAt: Date.now(),
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay' as const,
      signature: 'signature',
      version: 1 as const,
    };

    registry.clear();
    registry.onRecordSaved(listener);
    registry.save(record);
    registry.save({
      ...record,
      expiresAt: record.expiresAt + 1000,
      issuedAt: record.issuedAt + 500,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should keep recently expired relay records as fallback records', () => {
    const registry = new PublicRelayRecordRegistry();

    registry.clear();
    registry.save({
      expiresAt: 2000,
      issuedAt: 1000,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay',
      signature: 'signature',
      version: 1,
    });

    expect(registry.all(2500)).toEqual([]);
    expect(registry.fallbackMultiaddrs(2500)).toEqual([
      '/dns4/relay.test/tcp/4011/p2p/12D3Relay',
    ]);
  });

  it('should not replace fresher relay records with stale records', () => {
    const registry = new PublicRelayRecordRegistry();

    registry.clear();
    registry.save({
      expiresAt: 3000,
      issuedAt: 2000,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay',
      signature: 'new-signature',
      version: 1,
    });
    registry.save({
      expiresAt: 2000,
      issuedAt: 1000,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      peerId: '12D3Relay',
      publicKey: 'public-key',
      role: 'relay',
      signature: 'old-signature',
      version: 1,
    });

    expect(registry.all(2500)).toEqual([
      expect.objectContaining({
        expiresAt: 3000,
        signature: 'new-signature',
      }),
    ]);
  });
});
