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
    poolSignature: 'pool-signature',
    publicKey: 'public-key',
    role: 'call-relay',
    signature: 'signature',
    urls,
    version: 1,
  };
}

describe('CallRelayRecordDiscovery', () => {
  let registry: CallRelayRecordRegistry;
  let previousEnvironment: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnvironment = { ...process.env };
    process.env.CALLS_TURN_SHARED_SECRET = 'turn-shared-secret';
    registry = new CallRelayRecordRegistry();
    registry.clear();
  });

  afterEach(() => {
    process.env = previousEnvironment;
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

    expect(signer.verify).toHaveBeenCalledWith(
      record,
      record.signature,
      'turn-shared-secret',
    );
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

  it('should reject records that do not prove TURN pool membership', async () => {
    const signer = mock<CallRelayRecordSigner>();
    const discovery = new CallRelayRecordDiscovery(registry, signer);
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;
    const connection: PublicRelayPubSubConnection = {
      publishPubSub: jest.fn(),
      subscribePubSub: jest.fn(async (_topic, handler) => {
        subscribedHandler = handler;
      }),
    };
    const { poolSignature: _poolSignature, ...recordWithoutPoolSignature } =
      callRelayRecord(['turn:relay.example.test:4199?transport=udp']);

    await discovery.startConnection(connection);
    await subscribedHandler?.(JSON.stringify(recordWithoutPoolSignature));

    expect(signer.verify).not.toHaveBeenCalled();
    expect(registry.all()).toEqual([]);
  });
});
