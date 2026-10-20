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

const signalAttributes = (
  overrides: Partial<CallSignalSentAttributes>,
): CallSignalSentAttributes => {
  const sentAt = Date.now();

  return {
    attempt: 1,
    callId: CALL_ID,
    expiresAt: sentAt + 20_000,
    networkId: PRIVATE_NETWORK_ID,
    ownerNodeId: OWNER_NODE_ID,
    participantIds: [SENDER_IDENTITY_ID, RECIPIENT_IDENTITY_ID],
    payload: { sdp: 'probe' },
    recipientIdentityId: RECIPIENT_IDENTITY_ID,
    senderIdentityId: SENDER_IDENTITY_ID,
    sentAt,
    signalId: randomUUID(),
    signalType: 'offer',
    ...overrides,
  };
};

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

describe('#698 stage-2 red probes on 5602c2e2 (E1, E2, E4)', () => {
  describe('E1: private-network payload read by a non-recipient key holder', () => {
    const scenario = async () => {
      const key = PrivateKey.generate();
      const fabric = new FakeFabric();
      const sender = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PRIVATE_NETWORK_ID, 'private', key),
          fabric.connection,
        ),
      );
      const recipient = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PRIVATE_NETWORK_ID, 'private', key),
          fabric.connection,
        ),
      );
      const keyHolder = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PRIVATE_NETWORK_ID, 'private', key),
          fabric.connection,
        ),
      );
      const outsider = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(
            PRIVATE_NETWORK_ID,
            'private',
            PrivateKey.generate(),
          ),
          fabric.connection,
        ),
      );
      const marker = `probe-e1-${randomUUID()}`;
      const signalId = randomUUID();

      await sender.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PRIVATE_NETWORK_ID,
            payload: { sdp: marker },
            signalId,
          }),
        ),
      ]);

      return { fabric, keyHolder, marker, outsider, recipient, signalId };
    };

    it('E1 control: recipient registers the private-network signal', async () => {
      const s = await scenario();

      expect({
        e1RecipientRegistered: await s.recipient.repository.hasById(
          new CallSignalId(s.signalId),
        ),
      }).toEqual({ e1RecipientRegistered: true });
    });

    it('E1 control: private-network wire bytes carry no payload plaintext', async () => {
      const s = await scenario();

      expect({
        e1WireCarriesMarker: s.fabric.carried.some((payload) =>
          payload.includes(s.marker),
        ),
      }).toEqual({ e1WireCarriesMarker: false });
    });

    it('E1 control: holder of a different network key registers nothing', async () => {
      const s = await scenario();

      expect({
        e1OutsiderRegistered: await s.outsider.repository.hasById(
          new CallSignalId(s.signalId),
        ),
      }).toEqual({ e1OutsiderRegistered: false });
    });

    it('E1: non-recipient network key holder must not read the signal payload', async () => {
      const s = await scenario();
      const text = await registeredText(s.keyHolder, s.signalId);

      expect({
        e1KeyHolderReadsPayload: text?.includes(s.marker) ?? false,
      }).toEqual({ e1KeyHolderReadsPayload: false });
    });
  });

  describe('E2: public-network payload readable by any subscriber', () => {
    const scenario = async () => {
      const fabric = new FakeFabric();
      const sender = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PUBLIC_NETWORK_ID, 'public'),
          fabric.connection,
        ),
      );
      const recipient = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PUBLIC_NETWORK_ID, 'public'),
          fabric.connection,
        ),
      );
      const subscriber = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PUBLIC_NETWORK_ID, 'public'),
          fabric.connection,
        ),
      );
      const marker = `probe-e2-${randomUUID()}`;
      const signalId = randomUUID();

      await sender.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PUBLIC_NETWORK_ID,
            payload: { sdp: marker },
            signalId,
          }),
        ),
      ]);

      return { fabric, marker, recipient, signalId, subscriber };
    };

    it('E2 control: recipient registers the public-network signal', async () => {
      const s = await scenario();

      expect({
        e2RecipientRegistered: await s.recipient.repository.hasById(
          new CallSignalId(s.signalId),
        ),
      }).toEqual({ e2RecipientRegistered: true });
    });

    it('E2: public-network non-recipient subscriber must not read the payload', async () => {
      const s = await scenario();
      const text = await registeredText(s.subscriber, s.signalId);

      expect({
        e2SubscriberReadsPayload: text?.includes(s.marker) ?? false,
      }).toEqual({ e2SubscriberReadsPayload: false });
    });

    it('E2: public-network wire bytes must not carry payload plaintext', async () => {
      const s = await scenario();

      expect({
        e2WireCarriesMarker: s.fabric.carried.some((payload) =>
          payload.includes(s.marker),
        ),
      }).toEqual({ e2WireCarriesMarker: false });
    });
  });

  describe('E4: forged call signal accepted without sender authentication', () => {
    const scenario = async () => {
      const key = PrivateKey.generate();
      const fabric = new FakeFabric();
      const sender = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PRIVATE_NETWORK_ID, 'private', key),
          fabric.connection,
        ),
      );
      const recipient = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PRIVATE_NETWORK_ID, 'private', key),
          fabric.connection,
        ),
      );
      // Attacker is a network member that holds the network key.
      const attacker = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PRIVATE_NETWORK_ID, 'private', key),
          fabric.connection,
        ),
      );

      return { attacker, recipient, sender };
    };

    it('E4 control: recipient registers a signal published by the real sender', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.sender.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PRIVATE_NETWORK_ID,
            payload: { sdp: 'real-offer' },
            signalId,
          }),
        ),
      ]);

      expect({
        e4RealSignalRegistered: await s.recipient.repository.hasById(
          new CallSignalId(signalId),
        ),
      }).toEqual({ e4RealSignalRegistered: true });
    });

    it('E4: forged sender identity without signature must be refused', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.attacker.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PRIVATE_NETWORK_ID,
            payload: { sdp: 'forged-offer' },
            senderIdentityId: SENDER_IDENTITY_ID,
            signalId,
          }),
        ),
      ]);

      expect({
        e4ForgedSenderRegistered: await s.recipient.repository.hasById(
          new CallSignalId(signalId),
        ),
      }).toEqual({ e4ForgedSenderRegistered: false });
    });

    it('E4: sender-attributed signal with a forged DTLS fingerprint must be refused', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.attacker.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PRIVATE_NETWORK_ID,
            payload: {
              sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11',
            },
            senderIdentityId: SENDER_IDENTITY_ID,
            signalId,
          }),
        ),
      ]);

      expect({
        e4ForgedFingerprintRegistered: await s.recipient.repository.hasById(
          new CallSignalId(signalId),
        ),
      }).toEqual({ e4ForgedFingerprintRegistered: false });
    });
  });

  describe('E4 (public network): forged call signal with no private-network key', () => {
    const scenario = async () => {
      const fabric = new FakeFabric();
      const sender = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PUBLIC_NETWORK_ID, 'public'),
          fabric.connection,
        ),
      );
      const recipient = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PUBLIC_NETWORK_ID, 'public'),
          fabric.connection,
        ),
      );
      // Attacker holds no private-network key; it is a plain public subscriber.
      const attacker = await startNode(
        new IPFSNetwork(
          new IPFSNetworkConfig(PUBLIC_NETWORK_ID, 'public'),
          fabric.connection,
        ),
      );

      return { attacker, recipient, sender };
    };

    it('E4 public control: recipient registers a signal published by the real sender', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.sender.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PUBLIC_NETWORK_ID,
            payload: { sdp: 'real-public-offer' },
            signalId,
          }),
        ),
      ]);

      expect({
        e4PublicRealSignalRegistered: await s.recipient.repository.hasById(
          new CallSignalId(signalId),
        ),
      }).toEqual({ e4PublicRealSignalRegistered: true });
    });

    it('E4 public: forged sender identity on the public network must be refused', async () => {
      const s = await scenario();
      const signalId = randomUUID();

      await s.attacker.adapter.publish([
        new CallSignalSentEvent(
          CALL_ID,
          signalAttributes({
            networkId: PUBLIC_NETWORK_ID,
            payload: { sdp: 'forged-public-offer' },
            senderIdentityId: SENDER_IDENTITY_ID,
            signalId,
          }),
        ),
      ]);

      expect({
        e4PublicForgedSenderRegistered: await s.recipient.repository.hasById(
          new CallSignalId(signalId),
        ),
      }).toEqual({ e4PublicForgedSenderRegistered: false });
    });
  });
});
