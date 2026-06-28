import CallRelayRecordDiscovery from '@app/apps/apis/calls-api/CallRelayRecordDiscovery';
import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import { CallRelayRecordPrimitives } from '@app/apps/apis/calls-api/CallRelayRecordPrimitives';
import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';
import { PublicRelayPubSubConnection } from '@app/shared/infrastructure/network/relay/PublicRelayPubSubConnection';
import { mock } from 'jest-mock-extended';

function callRelayRecord(urls: string[]): CallRelayRecordPrimitives {
  return {
    expiresAt: Date.now() + 60_000,
    issuedAt: Date.now(),
    peerId: '12D3KooWCallRelay',
    publicKey: 'public-key',
    role: 'call-relay',
    signature: 'signature',
    urls,
    version: 1,
  };
}

describe('CallRelayRecordDiscovery', () => {
  let registry: CallRelayRecordRegistry;

  beforeEach(() => {
    registry = new CallRelayRecordRegistry();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should save signed TURN relay records received over pubsub', async () => {
    const signer = mock<CallRelayRecordSigner>();
    const discovery = new CallRelayRecordDiscovery(registry, signer);
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;
    const connection: PublicRelayPubSubConnection = {
      publishPubSub: jest.fn(),
      subscribePubSub: jest.fn(async (_topic, handler) => {
        subscribedHandler = handler;
      }),
    };
    const record = callRelayRecord([
      'turn:relay.example.test:4199?transport=udp',
    ]);

    signer.verify.mockResolvedValue(true);

    await discovery.startConnection(connection);
    await subscribedHandler?.(JSON.stringify(record));

    expect(registry.all()).toEqual([record]);
  });

  it('should reject call relay records without TURN urls', async () => {
    const signer = mock<CallRelayRecordSigner>();
    const discovery = new CallRelayRecordDiscovery(registry, signer);
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;
    const connection: PublicRelayPubSubConnection = {
      publishPubSub: jest.fn(),
      subscribePubSub: jest.fn(async (_topic, handler) => {
        subscribedHandler = handler;
      }),
    };

    await discovery.startConnection(connection);
    await subscribedHandler?.(JSON.stringify(callRelayRecord([])));
    await subscribedHandler?.(
      JSON.stringify(callRelayRecord(['stun:relay.example.test:3478'])),
    );

    expect(signer.verify).not.toHaveBeenCalled();
    expect(registry.all()).toEqual([]);
  });
});
