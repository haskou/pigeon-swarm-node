import RegisterCallSignalWhenSent from '@app/apps/consumers/pubsub/calls/RegisterCallSignalWhenSent';
import CallSignalDeliveryRegistrar from '@app/contexts/calls/application/register-signal-delivery/CallSignalDeliveryRegistrar';
import { CallSignalSentAttributes } from '@app/contexts/calls/domain/events/CallSignalSentAttributes';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
import InMemoryCallSignalDeliveryRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallSignalDeliveryRepository';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
import PubSubNetworkMessageCodec from '@app/shared/infrastructure/messageBus/libp2p/PubSubNetworkMessageCodec';
import PubSubTopicResolver from '@app/shared/infrastructure/messageBus/libp2p/PubSubTopicResolver';
import PubSubTransport from '@app/shared/infrastructure/pubsub/PubSubTransport';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { randomUUID } from 'crypto';
import { mock } from 'jest-mock-extended';

type PayloadHandler = (payload: string) => Promise<void>;

const SENDER_IDENTITY_ID =
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
const RECIPIENT_IDENTITY_ID =
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';
const CALL_ID = '550e8400-e29b-41d4-a716-446655440000';
const OWNER_NODE_ID = '9278e9db-bc4d-4a8f-9577-7cad4386512f';
const PRIVATE_NETWORK_ID = 'f8955c6e-39b1-42cc-8182-42ef86982b4e';
const PUBLIC_NETWORK_ID = '1f0d7a5e-4c1b-4e8a-9d3f-6b2c8e7a5d10';

/**
 * In-memory fabric at the IPFSConnection pubsub seam. It records the exact
 * string the bus adapter passes to network.publishPubSub (the wire bytes) and
 * fans it out to every subscriber of the topic.
 */
class FakeFabric {
  private readonly handlers = new Map<string, PayloadHandler[]>();
  public readonly carried: string[] = [];

  public readonly connection = {
    publishPubSub: (topic: string, payload: string) =>
      this.publish(topic, payload),
    subscribePubSub: (topic: string, handler: PayloadHandler) =>
      this.subscribe(topic, handler),
  } as unknown as IPFSConnection;

  private subscribe(topic: string, handler: PayloadHandler): Promise<void> {
    this.handlers.set(topic, [...(this.handlers.get(topic) ?? []), handler]);

    return Promise.resolve();
  }

  private async publish(topic: string, payload: string): Promise<void> {
    this.carried.push(payload);

    await Promise.all(
      (this.handlers.get(topic) ?? []).map((handler) => handler(payload)),
    );
  }
}

interface ProbeNode {
  adapter: Libp2pGossipsubAdapter;
  repository: InMemoryCallSignalDeliveryRepository;
}

// Real bus adapter, real codec, real envelope, real consumer and registrar.
const startNode = async (network: IPFSNetwork): Promise<ProbeNode> => {
  const registry = {
    getAll: () => [network],
    onNetworkRegistered: (): void => undefined,
  } as unknown as IPFSNetworkRegistry;
  const adapter = new Libp2pGossipsubAdapter(
    mock<PubSubTransport>(),
    registry,
    new PubSubTopicResolver(),
    new PubSubNetworkMessageCodec(),
  );
  const repository = new InMemoryCallSignalDeliveryRepository();
  const consumer = new RegisterCallSignalWhenSent(
    adapter as unknown as DomainEventConsumer,
    new CallSignalDeliveryRegistrar(repository),
  );

  await consumer.init();

  return { adapter, repository };
};

const CREATED_AT = 1_770_000_000_000;
const ENVELOPE = 'opaque-sealed-envelope-for-the-recipient-device';

/** A signal as the origin publishes it: sealed entries and a signature only. */
const signalAttributes = (
  overrides: Record<string, unknown>,
): CallSignalSentAttributes => ({
  attempt: 1,
  callId: CALL_ID,
  createdAt: CREATED_AT,
  expiresAt: CREATED_AT + 20_000,
  networkId: PRIVATE_NETWORK_ID,
  ownerNodeId: OWNER_NODE_ID,
  participantIds: [SENDER_IDENTITY_ID, RECIPIENT_IDENTITY_ID],
  recipientIdentityId: RECIPIENT_IDENTITY_ID,
  scopeType: 'conversation',
  sealedEntries: [
    {
      envelope: ENVELOPE,
      recipientDeviceCredential: 'recipient-device-credential',
    },
  ],
  senderDeviceCredential: 'sender-device-credential',
  senderIdentityId: SENDER_IDENTITY_ID,
  sentAt: CREATED_AT,
  signalId: randomUUID(),
  signalType: 'offer',
  signature: 'signature-over-the-signed-bytes',
  ...overrides,
});

const registeredText = async (
  node: ProbeNode,
  signalId: string,
): Promise<string | undefined> => {
  const id = new CallSignalId(signalId);

  if (!(await node.repository.hasById(id))) {
    return undefined;
  }

  return JSON.stringify(
    (await node.repository.requireById(id)).toPrimitives(),
  );
};

describe('#698 stage-2 call signal exposure probes (E1, E2, E4)', () => {
  const networks = [
    ['private', PRIVATE_NETWORK_ID, PrivateKey.generate()],
    ['public', PUBLIC_NETWORK_ID, undefined],
  ] as const;

  describe.each(networks)('on a %s network', (kind, networkId, key) => {
    const scenario = async () => {
      const fabric = new FakeFabric();
      const join = (): Promise<ProbeNode> =>
        startNode(
          new IPFSNetwork(
            new IPFSNetworkConfig(networkId, kind, key),
            fabric.connection,
          ),
        );

      return {
        bystander: await join(),
        fabric,
        recipient: await join(),
        sender: await join(),
      };
    };

    it('registers a sealed signal for the recipient and serves only the opaque envelope', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.sender.adapter.publish([
        new CallSignalSentEvent(CALL_ID, signalAttributes({ networkId, signalId })),
      ]);

      expect(
        await s.recipient.repository.hasById(new CallSignalId(signalId)),
      ).toBe(true);
      expect(
        s.fabric.carried.every((payload) => payload.includes(ENVELOPE)),
      ).toBe(true);
    });

    it('E1/E2: never registers or relays a plaintext payload that a sender adds', async () => {
      const s = await scenario();
      const marker = `probe-${randomUUID()}`;
      const signalId = randomUUID();

      await s.sender.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({ networkId, payload: { sdp: marker }, signalId }),
        ),
      ]);

      expect(
        (await registeredText(s.bystander, signalId))?.includes(marker) ??
          false,
      ).toBe(false);
      expect(
        (await registeredText(s.recipient, signalId))?.includes(marker) ??
          false,
      ).toBe(false);
    });

    it.each([
      ['no signature', { signature: '' }],
      ['no sender device', { senderDeviceCredential: '' }],
      ['no sealed entries', { sealedEntries: [] }],
      ['an expiry that is not twenty seconds after creation', { expiresAt: CREATED_AT + 30_000 }],
    ])('E4: refuses a signal with %s', async (_case, override) => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.sender.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({ networkId, signalId, ...override }),
        ),
      ]);

      expect(
        await s.recipient.repository.hasById(new CallSignalId(signalId)),
      ).toBe(false);
    });

    it('E4: refuses a legacy unsigned plaintext signal', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.sender.adapter.publish([
        new CallSignalSentEvent(CALL_ID, {
          attempt: 1,
          callId: CALL_ID,
          expiresAt: Date.now() + 20_000,
          networkId,
          ownerNodeId: OWNER_NODE_ID,
          participantIds: [SENDER_IDENTITY_ID, RECIPIENT_IDENTITY_ID],
          payload: { sdp: 'legacy-offer' },
          recipientIdentityId: RECIPIENT_IDENTITY_ID,
          senderIdentityId: SENDER_IDENTITY_ID,
          sentAt: Date.now(),
          signalId,
          signalType: 'offer',
        } as unknown as CallSignalSentAttributes),
      ]);

      expect(
        await s.recipient.repository.hasById(new CallSignalId(signalId)),
      ).toBe(false);
    });
  });
});
