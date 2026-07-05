import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { defaultRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import PublicRelayRuntime from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';
import { mock } from 'jest-mock-extended';

function publicRelayRecord(
  peerId: string,
  expiresAt: number,
): PublicRelayRecordPrimitives {
  return {
    expiresAt,
    issuedAt: 1,
    multiaddrs: [`/dns4/${peerId}.example.com/tcp/4011/p2p/${peerId}`],
    peerId,
    publicKey: `${peerId}-public-key`,
    role: 'relay',
    signature: `${peerId}-signature`,
    version: 1,
  };
}

function clearPublicRelayRuntimeState(): void {
  delete (
    globalThis as typeof globalThis & {
      __pigeonSwarmPublicRelayRuntime?: unknown;
    }
  ).__pigeonSwarmPublicRelayRuntime;
}

describe('PublicRelayRecordRegistry', () => {
  const registry = new PublicRelayRecordRegistry();
  let previousFallbackMs: string | undefined;
  let previousRecordsPath: string | undefined;

  beforeEach(() => {
    previousFallbackMs = process.env.PIGEON_STORED_RELAY_FALLBACK_MS;
    previousRecordsPath = process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH;
    delete process.env.PIGEON_STORED_RELAY_FALLBACK_MS;
    delete process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH;
    clearPublicRelayRuntimeState();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
    clearPublicRelayRuntimeState();

    if (previousFallbackMs === undefined) {
      delete process.env.PIGEON_STORED_RELAY_FALLBACK_MS;
    } else {
      process.env.PIGEON_STORED_RELAY_FALLBACK_MS = previousFallbackMs;
    }

    if (previousRecordsPath === undefined) {
      delete process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH;
    } else {
      process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH = previousRecordsPath;
    }
  });

  it('should exclude the local peer from active public relay records', () => {
    const localRecord = publicRelayRecord('peer-local', 2_000);
    const externalRecord = publicRelayRecord('peer-external', 2_000);
    const expiredRecord = publicRelayRecord('peer-expired', 500);

    registry.save(localRecord);
    registry.save(externalRecord);
    registry.save(expiredRecord);

    expect(registry.allExceptPeer('peer-local', 1_000)).toEqual([
      externalRecord,
    ]);
    expect(registry.multiaddrsExceptPeer('peer-local', 1_000)).toEqual(
      externalRecord.multiaddrs,
    );
  });

  it('should exclude the local peer from fallback public relay records', () => {
    process.env.PIGEON_STORED_RELAY_FALLBACK_MS = '1000';
    const localRecord = publicRelayRecord('peer-local', 1_500);
    const externalRecord = publicRelayRecord('peer-external', 1_500);

    registry.save(localRecord);
    registry.save(externalRecord);

    expect(registry.fallbackAllExceptPeer('peer-local', 2_000)).toEqual([
      externalRecord,
    ]);
    expect(registry.fallbackMultiaddrsExceptPeer('peer-local', 2_000)).toEqual(
      externalRecord.multiaddrs,
    );
  });

  it('should not save public relay records without multiaddrs', () => {
    registry.save({
      ...publicRelayRecord('peer-empty', 2_000),
      multiaddrs: [],
    });

    expect(registry.all(1_000)).toEqual([]);
    expect(registry.fallbackAll(1_000)).toEqual([]);
  });

  it('should not report its own public relay record as a discovered relay', () => {
    const localRecord = publicRelayRecord('peer-local', Date.now() + 60_000);
    const externalRecord = publicRelayRecord(
      'peer-external',
      Date.now() + 60_000,
    );
    const networkRegistry = mock<IPFSNetworkRegistry>();
    const runtime = new PublicRelayRuntime(networkRegistry);

    networkRegistry.getRelaySettings.mockReturnValue(
      defaultRelayRuntimeSettings(),
    );

    registry.save(localRecord);
    registry.save(externalRecord);
    (
      runtime as unknown as {
        state: {
          localPeerId?: string;
          node?: undefined;
          relayRecord?: undefined;
          relayStateLogged?: boolean;
        };
      }
    ).state.localPeerId = 'peer-local';

    expect(runtime.debugState().discoveredRelayCount).toBe(1);
    expect(runtime.debugState().discoveredRelayMultiaddrs).toEqual(
      externalRecord.multiaddrs,
    );
    expect(runtime.debugState().fallbackRelayCount).toBe(1);
    expect(runtime.debugState().fallbackRelayMultiaddrs).toEqual(
      externalRecord.multiaddrs,
    );
  });
});
