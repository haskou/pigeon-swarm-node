import { PublicRelayPubSubConnection } from '@app/shared/infrastructure/network/relay/PublicRelayPubSubConnection';
import { PublicRelayRecordDiscovery } from '@app/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from '@app/shared/infrastructure/network/relay/PublicRelayRecordSigner';
import { mock } from 'jest-mock-extended';

function publicRelayRecord(
  multiaddrs: string[],
): PublicRelayRecordPrimitives {
  return {
    expiresAt: Date.now() + 60_000,
    issuedAt: Date.now(),
    multiaddrs,
    peerId: '12D3KooWPublicRelay',
    publicKey: 'public-key',
    role: 'relay',
    signature: 'signature',
    version: 1,
  };
}

describe('PublicRelayRecordDiscovery', () => {
  let registry: PublicRelayRecordRegistry;

  beforeEach(() => {
    registry = new PublicRelayRecordRegistry();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should reject public relay records without multiaddrs', async () => {
    const signer = mock<PublicRelayRecordSigner>();
    const onValidRecord = jest.fn();
    const discovery = new PublicRelayRecordDiscovery(
      registry,
      signer,
      onValidRecord,
    );
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;
    const connection: PublicRelayPubSubConnection = {
      publishPubSub: jest.fn(),
      subscribePubSub: jest.fn(async (_topic, handler) => {
        subscribedHandler = handler;
      }),
    };

    await discovery.startConnection(connection);
    await subscribedHandler?.(JSON.stringify(publicRelayRecord([])));

    expect(signer.verify).not.toHaveBeenCalled();
    expect(onValidRecord).not.toHaveBeenCalled();
    expect(registry.all()).toEqual([]);
  });
});
