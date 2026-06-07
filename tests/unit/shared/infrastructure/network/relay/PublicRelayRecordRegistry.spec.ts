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
});
