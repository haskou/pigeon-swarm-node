import CallSignalAcknowledger from '@app/contexts/calls/application/acknowledge-signal/CallSignalAcknowledger';
import { CallSignalAcknowledgeMessage } from '@app/contexts/calls/application/acknowledge-signal/messages/CallSignalAcknowledgeMessage';
import CallSignalDeliveryExpirationRegistrar from '@app/contexts/calls/application/expire-signal-deliveries/CallSignalDeliveryExpirationRegistrar';
import CallSignalAcknowledgementRegistrar from '@app/contexts/calls/application/register-signal-acknowledgement/CallSignalAcknowledgementRegistrar';
import { CallSignalAcknowledgementRegisterMessage } from '@app/contexts/calls/application/register-signal-acknowledgement/messages/CallSignalAcknowledgementRegisterMessage';
import CallSignalDeliveryRegistrar from '@app/contexts/calls/application/register-signal-delivery/CallSignalDeliveryRegistrar';
import { CallSignalDeliveryRegisterMessage } from '@app/contexts/calls/application/register-signal-delivery/messages/CallSignalDeliveryRegisterMessage';
import CallSignalDeliveryRetrier from '@app/contexts/calls/application/retry-signal-deliveries/CallSignalDeliveryRetrier';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
import { CallSignalType } from '@app/contexts/calls/domain/value-objects/CallSignalType';
import InMemoryCallSignalDeliveryRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallSignalDeliveryRepository';
import CallSignalSender from '@app/contexts/calls/application/send-signal/CallSignalSender';
import { CallSignalSendMessage } from '@app/contexts/calls/application/send-signal/messages/CallSignalSendMessage';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('Call signal delivery applications', () => {
  const signalId = '68da3440-c60e-4fe3-b86a-2b8931ea345f';
  const callId = '550e8400-e29b-41d4-a716-446655440000';
  const ownerNodeId = '9278e9db-bc4d-4a8f-9577-7cad4386512f';
  const networkId = 'f8955c6e-39b1-42cc-8182-42ef86982b4e';
  const senderIdentityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const recipientIdentityId =
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function registerMessage(
    attempt: number = 1,
  ): CallSignalDeliveryRegisterMessage {
    return new CallSignalDeliveryRegisterMessage({
      attempt,
      callId,
      expiresAt: 1_770_000_020_000,
      networkId,
      ownerNodeId,
      participantIds: [senderIdentityId, recipientIdentityId],
      payload: { sdp: 'offer-sdp' },
      recipientIdentityId,
      senderIdentityId,
      sentAt: 1_770_000_000_000,
      signalId,
      signalType: 'offer',
    });
  }

  it('registers a received signal for acknowledgement', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const registrar = new CallSignalDeliveryRegistrar(repository);

    await registrar.register(registerMessage());

    await expect(
      repository.findById(new CallSignalId(signalId)),
    ).resolves.toBeDefined();
  });

  it('acknowledges a signal and publishes the acknowledgement', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const eventPublisher = mock<DomainEventPublisher>();
    const registrar = new CallSignalDeliveryRegistrar(repository);
    const acknowledger = new CallSignalAcknowledger(
      repository,
      eventPublisher,
    );

    jest.spyOn(Date, 'now').mockReturnValue(1_770_000_000_500);
    await registrar.register(registerMessage());
    await acknowledger.acknowledge(
      new CallSignalAcknowledgeMessage(signalId, recipientIdentityId),
    );

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(
      (await repository.findById(new CallSignalId(signalId)))?.isAcknowledged(),
    ).toBe(true);
  });

  it('republishes an acknowledgement when the recipient repeats it', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const eventPublisher = mock<DomainEventPublisher>();
    const registrar = new CallSignalDeliveryRegistrar(repository);
    const acknowledger = new CallSignalAcknowledger(
      repository,
      eventPublisher,
    );
    const message = new CallSignalAcknowledgeMessage(
      signalId,
      recipientIdentityId,
    );

    jest.spyOn(Date, 'now').mockReturnValue(1_770_000_000_500);
    await registrar.register(registerMessage());
    await acknowledger.acknowledge(message);
    await acknowledger.acknowledge(message);

    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
  });

  it('registers a remote acknowledgement idempotently', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const deliveryRegistrar = new CallSignalDeliveryRegistrar(repository);
    const acknowledgementRegistrar = new CallSignalAcknowledgementRegistrar(
      repository,
    );

    await deliveryRegistrar.register(registerMessage());
    await acknowledgementRegistrar.register(
      new CallSignalAcknowledgementRegisterMessage(
        signalId,
        recipientIdentityId,
        1_770_000_000_500,
      ),
    );
    await acknowledgementRegistrar.register(
      new CallSignalAcknowledgementRegisterMessage(
        signalId,
        recipientIdentityId,
        1_770_000_000_600,
      ),
    );

    expect(
      (await repository.findById(new CallSignalId(signalId)))?.isAcknowledged(),
    ).toBe(true);
  });

  it('retries only deliveries owned by the local node', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const eventPublisher = mock<DomainEventPublisher>();
    const nodeRepository = mock<NodeRepository>();
    const registrar = new CallSignalDeliveryRegistrar(repository);

    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(ownerNodeId));
    await registrar.register(registerMessage());

    await new CallSignalDeliveryRetrier(
      repository,
      nodeRepository,
      eventPublisher,
    ).retry(new Timestamp(1_770_000_001_000));

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(
      (
        await repository.findById(new CallSignalId(signalId))
      )?.toPrimitives().attempt,
    ).toBe(2);
  });

  it('purges expired deliveries', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const registrar = new CallSignalDeliveryRegistrar(repository);

    await registrar.register(registerMessage());
    await new CallSignalDeliveryExpirationRegistrar(repository).expire(
      new Timestamp(1_770_000_020_000),
    );

    await expect(
      repository.findById(new CallSignalId(signalId)),
    ).resolves.toBeUndefined();
  });

  it('creates and publishes a pending delivery when sending', async () => {
    const callRepository: MockProxy<CallRepository> = mock<CallRepository>();
    const nodeRepository = mock<NodeRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const deliveryRepository = new InMemoryCallSignalDeliveryRepository();
    const senderIdentity = new IdentityId(senderIdentityId);
    const recipientIdentity = new IdentityId(recipientIdentityId);
    const call = Call.start(
      senderIdentity,
      new NetworkId(networkId),
      CallScope.conversation(new ConversationId('one-to-one:signal-test')),
      [recipientIdentity],
    );

    callRepository.findById.mockResolvedValue(call);
    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(ownerNodeId));
    const sender = new CallSignalSender(
      callRepository,
      deliveryRepository,
      eventPublisher,
      nodeRepository,
    );

    const delivery = await sender.send(
      new CallSignalSendMessage(
        call.getId().valueOf(),
        senderIdentityId,
        recipientIdentityId,
        new CallSignalType('offer').valueOf(),
        { sdp: 'offer-sdp' },
      ),
    );

    expect(delivery.getId()).toBeInstanceOf(CallSignalId);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    await expect(
      deliveryRepository.findById(delivery.getId()),
    ).resolves.toBeDefined();
  });
});
