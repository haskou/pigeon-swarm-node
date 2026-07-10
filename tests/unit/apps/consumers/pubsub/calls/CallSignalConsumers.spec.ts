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

  it('registers received signal deliveries', async () => {
    const eventConsumer = mock<DomainEventConsumer>();
    const registrar = mock<CallSignalDeliveryRegistrar>();
    const consumer = new RegisterCallSignalWhenSent(
      eventConsumer,
      registrar,
    );
    const event = new CallSignalSentEvent(
      '550e8400-e29b-41d4-a716-446655440000',
      {
        attempt: 1,
        callId: '550e8400-e29b-41d4-a716-446655440000',
        expiresAt: 1_770_000_020_000,
        networkId: 'f8955c6e-39b1-42cc-8182-42ef86982b4e',
        ownerNodeId: '9278e9db-bc4d-4a8f-9577-7cad4386512f',
        participantIds: [senderIdentityId, recipientIdentityId],
        payload: { sdp: 'offer-sdp' },
        recipientIdentityId,
        senderIdentityId,
        sentAt: 1_770_000_000_000,
        signalId: '68da3440-c60e-4fe3-b86a-2b8931ea345f',
        signalType: 'offer',
      },
    );

    await consumer.handler(event);

    expect(registrar.register).toHaveBeenCalledTimes(1);
  });

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
