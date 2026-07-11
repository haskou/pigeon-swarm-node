import CallSignalDeliveryMaintenanceRuntime from '@app/apps/runtimes/call-signal-delivery-maintenance-runtime/CallSignalDeliveryMaintenanceRuntime';
import CallSignalDeliveryExpirationRegistrar from '@app/contexts/calls/application/expire-signal-deliveries/CallSignalDeliveryExpirationRegistrar';
import CallSignalDeliveryRetrier from '@app/contexts/calls/application/retry-signal-deliveries/CallSignalDeliveryRetrier';
import { CallSignalDelivery } from '@app/contexts/calls/domain/CallSignalDelivery';
import { CallSignalDeliveryRoute } from '@app/contexts/calls/domain/CallSignalDeliveryRoute';
import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
import { CallSignalType } from '@app/contexts/calls/domain/value-objects/CallSignalType';
import InMemoryCallSignalDeliveryRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallSignalDeliveryRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

describe('CallSignalDeliveryMaintenanceRuntime', () => {
  const ownerNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440002');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_770_000_000_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays idle without pending signal deliveries', async () => {
    const retrier = mock<CallSignalDeliveryRetrier>();
    const expirationRegistrar = mock<CallSignalDeliveryExpirationRegistrar>();
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.loadLocalNodeId.mockResolvedValue(ownerNodeId);
    const runtime = new CallSignalDeliveryMaintenanceRuntime(
      new InMemoryCallSignalDeliveryRepository(),
      retrier,
      expirationRegistrar,
      nodeRepository,
    );

    await runtime.run();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(retrier.retry).not.toHaveBeenCalled();
    expect(expirationRegistrar.expire).not.toHaveBeenCalled();
  });

  it('schedules maintenance at the next delivery deadline', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const retrier = mock<CallSignalDeliveryRetrier>();
    const expirationRegistrar = mock<CallSignalDeliveryExpirationRegistrar>();
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.loadLocalNodeId.mockResolvedValue(ownerNodeId);
    const runtime = new CallSignalDeliveryMaintenanceRuntime(
      repository,
      retrier,
      expirationRegistrar,
      nodeRepository,
    );
    const senderIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
    );
    const recipientIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=',
    );

    await runtime.run();
    await repository.save(
      CallSignalDelivery.send(
        new CallSignalId('550e8400-e29b-41d4-a716-446655440001'),
        new CallSignalDeliveryRoute(
          new CallId('550e8400-e29b-41d4-a716-446655440000'),
          ownerNodeId,
          new NetworkId('550e8400-e29b-41d4-a716-446655440003'),
          [senderIdentityId, recipientIdentityId],
        ),
        new CallSignal(
          senderIdentityId,
          recipientIdentityId,
          new CallSignalType('offer'),
          { sdp: 'offer' },
        ),
        new Timestamp(Date.now()),
      ),
    );

    await jest.advanceTimersByTimeAsync(999);
    expect(retrier.retry).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(retrier.retry).toHaveBeenCalledTimes(1);
    expect(expirationRegistrar.expire).toHaveBeenCalledTimes(1);
  });

  it('schedules remote-owned deliveries only for expiration', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const retrier = mock<CallSignalDeliveryRetrier>();
    const expirationRegistrar = mock<CallSignalDeliveryExpirationRegistrar>();
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.loadLocalNodeId.mockResolvedValue(ownerNodeId);
    const runtime = new CallSignalDeliveryMaintenanceRuntime(
      repository,
      retrier,
      expirationRegistrar,
      nodeRepository,
    );
    const senderIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
    );
    const recipientIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=',
    );

    await repository.save(
      CallSignalDelivery.send(
        new CallSignalId('550e8400-e29b-41d4-a716-446655440001'),
        new CallSignalDeliveryRoute(
          new CallId('550e8400-e29b-41d4-a716-446655440000'),
          new NodeId('550e8400-e29b-41d4-a716-446655440004'),
          new NetworkId('550e8400-e29b-41d4-a716-446655440003'),
          [senderIdentityId, recipientIdentityId],
        ),
        new CallSignal(
          senderIdentityId,
          recipientIdentityId,
          new CallSignalType('offer'),
          { sdp: 'offer' },
        ),
        new Timestamp(Date.now()),
      ),
    );
    await runtime.run();

    await jest.advanceTimersByTimeAsync(19_999);
    expect(retrier.retry).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(retrier.retry).toHaveBeenCalledTimes(1);
    expect(expirationRegistrar.expire).toHaveBeenCalledTimes(1);
  });

  it('backs off when maintenance fails', async () => {
    const repository = new InMemoryCallSignalDeliveryRepository();
    const retrier = mock<CallSignalDeliveryRetrier>();
    const expirationRegistrar = mock<CallSignalDeliveryExpirationRegistrar>();
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.loadLocalNodeId.mockResolvedValue(ownerNodeId);
    retrier.retry.mockRejectedValue(new Error('temporarily unavailable'));
    const runtime = new CallSignalDeliveryMaintenanceRuntime(
      repository,
      retrier,
      expirationRegistrar,
      nodeRepository,
    );
    const senderIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
    );
    const recipientIdentityId = new IdentityId(
      'MCowBQYDK2VwAyEACdZwo16pCFQ1jxy5u2ZIOlVxcrx8QTHKDcLqGfWRgFk=',
    );

    await repository.save(
      CallSignalDelivery.send(
        new CallSignalId('550e8400-e29b-41d4-a716-446655440001'),
        new CallSignalDeliveryRoute(
          new CallId('550e8400-e29b-41d4-a716-446655440000'),
          ownerNodeId,
          new NetworkId('550e8400-e29b-41d4-a716-446655440003'),
          [senderIdentityId, recipientIdentityId],
        ),
        new CallSignal(
          senderIdentityId,
          recipientIdentityId,
          new CallSignalType('offer'),
          { sdp: 'offer' },
        ),
        new Timestamp(Date.now()),
      ),
    );
    await runtime.run();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(retrier.retry).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(retrier.retry).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(retrier.retry).toHaveBeenCalledTimes(2);
  });
});
