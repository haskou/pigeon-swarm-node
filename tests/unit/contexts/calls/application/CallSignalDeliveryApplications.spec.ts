import { callStartArgs } from '../../../../support/signCall';
import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallSignalAcknowledger from '@app/contexts/calls/application/acknowledge-signal/CallSignalAcknowledger';
import { CallSignalAcknowledgeMessage } from '@app/contexts/calls/application/acknowledge-signal/messages/CallSignalAcknowledgeMessage';
import CallSignalDeliveryExpirationRegistrar from '@app/contexts/calls/application/expire-signal-deliveries/CallSignalDeliveryExpirationRegistrar';
import CallSignalAcknowledgementRegistrar from '@app/contexts/calls/application/register-signal-acknowledgement/CallSignalAcknowledgementRegistrar';
import { CallSignalAcknowledgementRegisterMessage } from '@app/contexts/calls/application/register-signal-acknowledgement/messages/CallSignalAcknowledgementRegisterMessage';
import CallSignalDeliveryRegistrar from '@app/contexts/calls/application/register-signal-delivery/CallSignalDeliveryRegistrar';
import { CallSignalDeliveryRegisterMessage } from '@app/contexts/calls/application/register-signal-delivery/messages/CallSignalDeliveryRegisterMessage';
import CallSignalDeliveryRetrier from '@app/contexts/calls/application/retry-signal-deliveries/CallSignalDeliveryRetrier';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantNotFoundError } from '@app/contexts/calls/domain/errors/CallParticipantNotFoundError';
import { CallSignalAlreadySentError } from '@app/contexts/calls/domain/errors/CallSignalAlreadySentError';
import { CallSignalMismatchError } from '@app/contexts/calls/domain/errors/CallSignalMismatchError';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
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
  const receivingNodeId = '3c9d2f4e-7a1b-4c8d-9e0f-1a2b3c4d5e6f';
  const networkId = 'f8955c6e-39b1-42cc-8182-42ef86982b4e';
  const senderIdentityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const recipientIdentityId =
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';
  const createdAt = 1_770_000_000_000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(createdAt);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function signalFor(
    callIdValue: string = callId,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      callId: callIdValue,
      createdAt,
      expiresAt: createdAt + 20_000,
      networkId,
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
      signalId,
      signalType: 'offer',
      signature: 'ed25519-signature-over-signed-bytes',
      ...overrides,
    };
  }

  function callFor(networkIdValue: string = networkId) {
    return Call.start(
      new IdentityId(senderIdentityId),
      new NetworkId(networkIdValue),
      CallScope.conversation(new ConversationId('one-to-one:signal-test')),
      [new IdentityId(recipientIdentityId)],
      ...callStartArgs(),
    );
  }

  function senderFor(
    call: Call,
    deliveryRepository = new InMemoryCallSignalDeliveryRepository(),
  ): CallSignalSender {
    const callRepository = mock<CallRepository>();
    const nodeRepository = mock<NodeRepository>();

    callRepository.requireById.mockResolvedValue(call);
    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(ownerNodeId));

    return new CallSignalSender(
      callRepository,
      deliveryRepository,
      mock<DomainEventPublisher>(),
      nodeRepository,
      mock<CallAccessAuthorizer>(),
    );
  }

  function registerMessage(
    attempt: number = 1,
    sentAt: number = createdAt,
  ): CallSignalDeliveryRegisterMessage {
    return new CallSignalDeliveryRegisterMessage({
      ...signalFor(),
      attempt,
      ownerNodeId,
      participantIds: [senderIdentityId, recipientIdentityId],
      sentAt,
    });
  }

  /** A registrar on a node that is not the delivery owner unless stated. */
  function registrarFor(
    repository: InMemoryCallSignalDeliveryRepository,
    localNodeId: string = receivingNodeId,
  ): CallSignalDeliveryRegistrar {
    const nodeRepository = mock<NodeRepository>();

    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(localNodeId));

    return new CallSignalDeliveryRegistrar(repository, nodeRepository);
  }

  it('registers a received signal for acknowledgement', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const registrar = registrarFor(repository);

    await registrar.register(registerMessage());

    await expect(
      repository.requireById(new CallSignalId(signalId)),
    ).resolves.toBeDefined();
  });

  it('never lets a received delivery replace one this node owns', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();

    await repository.save(registerMessage().toDelivery());
    await registrarFor(repository, ownerNodeId).register(
      registerMessage(4, createdAt + 1_000),
    );

    const stored = await repository.requireById(new CallSignalId(signalId));
    expect(stored.toPrimitives().attempt).toBe(1);
  });

  it('does not register a received delivery that names this node as owner', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();

    await registrarFor(repository, ownerNodeId).register(registerMessage());

    await expect(repository.hasById(new CallSignalId(signalId))).resolves.toBe(
      false,
    );
  });

  it('lets a later attempt from the owner replace a received delivery', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const registrar = registrarFor(repository);

    await registrar.register(registerMessage());
    await registrar.register(registerMessage(2, createdAt + 1_000));

    const stored = await repository.requireById(new CallSignalId(signalId));
    expect(stored.toPrimitives().attempt).toBe(2);
  });

  it('acknowledges a signal and publishes the acknowledgement', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const eventPublisher = mock<DomainEventPublisher>();
    const registrar = registrarFor(repository);
    const acknowledger = new CallSignalAcknowledger(repository, eventPublisher);

    jest.spyOn(Date, 'now').mockReturnValue(1_770_000_000_500);
    await registrar.register(registerMessage());
    await acknowledger.acknowledge(
      new CallSignalAcknowledgeMessage(signalId, recipientIdentityId),
    );

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const stored = await repository.requireById(new CallSignalId(signalId));
    expect(stored.isAcknowledged()).toBe(true);
  });

  it('republishes an acknowledgement when the recipient repeats it', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const eventPublisher = mock<DomainEventPublisher>();
    const registrar = registrarFor(repository);
    const acknowledger = new CallSignalAcknowledger(repository, eventPublisher);
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
    const deliveryRegistrar = registrarFor(repository);
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

    const stored = await repository.requireById(new CallSignalId(signalId));
    expect(stored.isAcknowledged()).toBe(true);
  });

  it('retries only deliveries owned by the local node', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const eventPublisher = mock<DomainEventPublisher>();
    const nodeRepository = mock<NodeRepository>();

    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(ownerNodeId));
    await repository.save(registerMessage().toDelivery());

    await new CallSignalDeliveryRetrier(
      repository,
      nodeRepository,
      eventPublisher,
    ).retry(new Timestamp(1_770_000_001_000));

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const stored = await repository.requireById(new CallSignalId(signalId));
    expect(stored.toPrimitives().attempt).toBe(2);
  });

  it('purges expired deliveries', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const registrar = registrarFor(repository);

    await registrar.register(registerMessage());
    await new CallSignalDeliveryExpirationRegistrar(repository).expire(
      new Timestamp(1_770_000_020_000),
    );

    await expect(repository.hasById(new CallSignalId(signalId))).resolves.toBe(
      false,
    );
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
      ...callStartArgs(),
    );

    callRepository.requireById.mockResolvedValue(call);
    nodeRepository.loadLocalNodeId.mockResolvedValue(new NodeId(ownerNodeId));
    const sender = new CallSignalSender(
      callRepository,
      deliveryRepository,
      eventPublisher,
      nodeRepository,
      mock<CallAccessAuthorizer>(),
    );

    const delivery = await sender.send(
      new CallSignalSendMessage(
        call.getId().valueOf(),
        senderIdentityId,
        signalFor(call.getId().valueOf()),
      ),
    );

    expect(delivery.getId()).toBeInstanceOf(CallSignalId);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    await expect(
      deliveryRepository.requireById(delivery.getId()),
    ).resolves.toBeDefined();
  });

  it('stores the sealed entries and signature without a payload', async () => {
    const call = callFor();

    const delivery = await senderFor(call).send(
      new CallSignalSendMessage(
        call.getId().valueOf(),
        senderIdentityId,
        signalFor(call.getId().valueOf()),
      ),
    );

    expect(delivery.toPrimitives()).toMatchObject({
      expiresAt: createdAt + 20_000,
      signature: 'ed25519-signature-over-signed-bytes',
      sealedEntries: [
        {
          envelope: 'sealed-envelope-for-recipient-device',
          recipientDeviceCredential: 'recipient-device-credential',
        },
      ],
    });
    expect(delivery.toPrimitives()).not.toHaveProperty('payload');
  });

  it('refuses a call id that does not match the path', () => {
    expect(
      () =>
        new CallSignalSendMessage(
          '6b3b7e0e-8b8a-4d0a-9f5e-2c1d3a4b5c6d',
          senderIdentityId,
          signalFor(),
        ),
    ).toThrow(CallSignalMismatchError);
  });

  it('refuses a signal sent by someone other than the authenticated caller', () => {
    expect(
      () => new CallSignalSendMessage(callId, recipientIdentityId, signalFor()),
    ).toThrow(CallSignalMismatchError);
  });

  it('refuses a scope that does not match the call before spending rate budget', async () => {
    const call = callFor();
    const onCallFound = jest.fn().mockResolvedValue(undefined);

    await expect(
      senderFor(call).send(
        new CallSignalSendMessage(
          call.getId().valueOf(),
          senderIdentityId,
          signalFor(call.getId().valueOf(), { scopeType: 'community_channel' }),
        ),
        onCallFound,
      ),
    ).rejects.toBeInstanceOf(CallSignalMismatchError);
    expect(onCallFound).not.toHaveBeenCalled();
  });

  it('refuses a network that does not match the call before spending rate budget', async () => {
    const call = callFor();
    const onCallFound = jest.fn().mockResolvedValue(undefined);

    await expect(
      senderFor(call).send(
        new CallSignalSendMessage(
          call.getId().valueOf(),
          senderIdentityId,
          signalFor(call.getId().valueOf(), {
            networkId: '0b8f7a9e-3c1d-4e2f-8a6b-5d4c3b2a1f0e',
          }),
        ),
        onCallFound,
      ),
    ).rejects.toBeInstanceOf(CallSignalMismatchError);
    expect(onCallFound).not.toHaveBeenCalled();
  });

  it('refuses a signal id already in use before spending rate budget', async () => {
    const call = callFor();
    const sender = senderFor(call);
    const onCallFound = jest.fn().mockResolvedValue(undefined);
    const message = new CallSignalSendMessage(
      call.getId().valueOf(),
      senderIdentityId,
      signalFor(call.getId().valueOf()),
    );

    await sender.send(message, onCallFound);

    await expect(sender.send(message, onCallFound)).rejects.toBeInstanceOf(
      CallSignalAlreadySentError,
    );
    expect(onCallFound).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not ready while its record awaits admission', new Error('not ready')],
    ['as not found once the records of both are settled', undefined],
  ])(
    'answers a sender the call does not show as joined %s',
    async (_case, notReady) => {
      const callRepository = mock<CallRepository>();
      const caller = new IdentityId(senderIdentityId);
      const invited = new IdentityId(recipientIdentityId);
      const call = Call.start(
        caller,
        new NetworkId(networkId),
        CallScope.conversation(new ConversationId('one-to-one:signal-test')),
        [invited],
        ...callStartArgs(),
      );

      callRepository.requireById.mockResolvedValue(call);
      if (notReady) {
        callRepository.assertParticipantSettled.mockRejectedValue(notReady);
      } else callRepository.assertParticipantSettled.mockResolvedValue();
      const sender = new CallSignalSender(
        callRepository,
        new InMemoryCallSignalDeliveryRepository(),
        mock<DomainEventPublisher>(),
        mock<NodeRepository>(),
        mock<CallAccessAuthorizer>(),
      );

      const sent = sender.send(
        new CallSignalSendMessage(
          call.getId().valueOf(),
          recipientIdentityId,
          signalFor(call.getId().valueOf(), {
            recipientIdentityId: senderIdentityId,
            senderIdentityId: recipientIdentityId,
          }),
        ),
      );

      if (notReady) await expect(sent).rejects.toBe(notReady);
      else {
        await expect(sent).rejects.toBeInstanceOf(CallParticipantNotFoundError);
        expect(callRepository.assertParticipantSettled).toHaveBeenCalledWith(
          call.getId(),
          caller,
        );
      }
      expect(callRepository.assertParticipantSettled).toHaveBeenCalledWith(
        call.getId(),
        invited,
      );
    },
  );
});
