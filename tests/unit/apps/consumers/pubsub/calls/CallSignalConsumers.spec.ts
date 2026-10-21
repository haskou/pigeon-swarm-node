import RegisterCallSignalAcknowledgement from '@app/apps/consumers/pubsub/calls/RegisterCallSignalAcknowledgement';
import RegisterCallSignalWhenSent from '@app/apps/consumers/pubsub/calls/RegisterCallSignalWhenSent';
import CallSignalAcknowledgementRegistrar from '@app/contexts/calls/application/register-signal-acknowledgement/CallSignalAcknowledgementRegistrar';
import CallSignalDeliveryRegistrar from '@app/contexts/calls/application/register-signal-delivery/CallSignalDeliveryRegistrar';
import { CallSignalAcknowledgedEvent } from '@app/contexts/calls/domain/events/CallSignalAcknowledgedEvent';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { mock } from 'jest-mock-extended';

describe('Call signal consumers', () => {
  const senderIdentityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const recipientIdentityId =
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';
  const createdAt = 1_770_000_000_000;
  const signalAttributes = {
    attempt: 1,
    callId: '550e8400-e29b-41d4-a716-446655440000',
    createdAt,
    expiresAt: createdAt + 20_000,
    networkId: 'f8955c6e-39b1-42cc-8182-42ef86982b4e',
    ownerNodeId: '9278e9db-bc4d-4a8f-9577-7cad4386512f',
    participantIds: [senderIdentityId, recipientIdentityId],
    recipientIdentityId,
    scopeType: 'conversation',
    sealedEntries: [
      {
        envelope: 'sealed-envelope-for-recipient-device',
        recipientDeviceCredential: 'recipient-device-credential',
      },
    ],
    senderDeviceCredential: 'sender-device-credential',
    senderIdentityId,
    sentAt: createdAt,
    signalId: '68da3440-c60e-4fe3-b86a-2b8931ea345f',
    signalType: 'offer',
    signature: 'ed25519-signature-over-signed-bytes',
  };

  it('registers received signal deliveries', async () => {
    const eventConsumer = mock<DomainEventConsumer>();
    const registrar = mock<CallSignalDeliveryRegistrar>();
    const consumer = new RegisterCallSignalWhenSent(
      eventConsumer,
      registrar,
    );
    const event = new CallSignalSentEvent(
      '550e8400-e29b-41d4-a716-446655440000',
      signalAttributes,
    );

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
  });

  it('refuses a received signal that has already expired, without registering it', async () => {
    const eventConsumer = mock<DomainEventConsumer>();
    const registrar = mock<CallSignalDeliveryRegistrar>();
    const consumer = new RegisterCallSignalWhenSent(eventConsumer, registrar);
    const expiredAt = Date.now() - 60_000;
    const event = new CallSignalSentEvent('550e8400-e29b-41d4-a716-446655440000', {
      ...signalAttributes,
      createdAt: expiredAt,
      expiresAt: expiredAt + 20_000,
      sentAt: expiredAt,
    });

    await expect(consumer.handler(event)).resolves.toBeUndefined();
    expect(registrar.register).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty signature', { signature: '' }],
    [
      'an expiry that is not twenty seconds after creation',
      { expiresAt: createdAt + 30_000 },
    ],
    ['an empty sealed entry list', { sealedEntries: [] }],
  ])(
    'refuses a received signal with %s without registering it',
    async (_case, override) => {
      const eventConsumer = mock<DomainEventConsumer>();
      const registrar = mock<CallSignalDeliveryRegistrar>();
      const consumer = new RegisterCallSignalWhenSent(
        eventConsumer,
        registrar,
      );
      const event = new CallSignalSentEvent(
        '550e8400-e29b-41d4-a716-446655440000',
        { ...signalAttributes, ...override },
      );

      await expect(consumer.handler(event)).resolves.toBeUndefined();
      expect(registrar.register).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['participant ids that are not an array', { participantIds: 'nobody' }],
    ['participant ids holding a non-identity', { participantIds: [7] }],
    ['an owner node id that is not a node id', { ownerNodeId: 'not-a-node' }],
    ['an attempt outside the retry policy', { attempt: 99 }],
    ['a non-numeric attempt', { attempt: 'one' }],
    ['a sent-at that is not a timestamp', { sentAt: 'yesterday' }],
    [
      'a creation time far in the future',
      {
        createdAt: Date.now() + 3_600_000,
        expiresAt: Date.now() + 3_620_000,
        sentAt: Date.now(),
      },
    ],
  ])(
    'refuses a received signal with %s without a raw error and without registering',
    async (_case, override) => {
      const eventConsumer = mock<DomainEventConsumer>();
      const registrar = mock<CallSignalDeliveryRegistrar>();
      const consumer = new RegisterCallSignalWhenSent(
        eventConsumer,
        registrar,
      );
      const event = new CallSignalSentEvent(
        '550e8400-e29b-41d4-a716-446655440000',
        { ...signalAttributes, ...override } as never,
      );

      await expect(consumer.handler(event)).resolves.toBeUndefined();
      expect(registrar.register).not.toHaveBeenCalled();
    },
  );

  it('registers received signal acknowledgements', async () => {
    const eventConsumer = mock<DomainEventConsumer>();
    const registrar = mock<CallSignalAcknowledgementRegistrar>();
    const consumer = new RegisterCallSignalAcknowledgement(
      eventConsumer,
      registrar,
    );
    const event = new CallSignalAcknowledgedEvent(
      '550e8400-e29b-41d4-a716-446655440000',
      {
        acknowledgedAt: 1_770_000_000_500,
        callId: '550e8400-e29b-41d4-a716-446655440000',
        networkId: 'f8955c6e-39b1-42cc-8182-42ef86982b4e',
        ownerNodeId: '9278e9db-bc4d-4a8f-9577-7cad4386512f',
        recipientIdentityId,
        senderIdentityId,
        signalId: '68da3440-c60e-4fe3-b86a-2b8931ea345f',
      },
    );

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
  });
});
