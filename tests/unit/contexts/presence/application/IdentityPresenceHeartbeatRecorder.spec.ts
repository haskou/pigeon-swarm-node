import IdentityPresenceHeartbeatRecorder from '@app/contexts/presence/application/record-heartbeat/IdentityPresenceHeartbeatRecorder';
import { IdentityPresenceHeartbeatMessage } from '@app/contexts/presence/application/record-heartbeat/messages/IdentityPresenceHeartbeatMessage';
import IdentityPresenceNetworkResolver from '@app/contexts/presence/application/resolve-network/IdentityPresenceNetworkResolver';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityPresenceHeartbeatRecorder', () => {
  let repository: MockProxy<IdentityPresenceRepository>;
  let networkResolver: MockProxy<IdentityPresenceNetworkResolver>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let nodeRepository: MockProxy<NodeRepository>;
  let recorder: IdentityPresenceHeartbeatRecorder;

  beforeEach(() => {
    repository = mock<IdentityPresenceRepository>();
    networkResolver = mock<IdentityPresenceNetworkResolver>();
    eventPublisher = mock<DomainEventPublisher>();
    nodeRepository = mock<NodeRepository>();
    recorder = new IdentityPresenceHeartbeatRecorder(
      repository,
      networkResolver,
      eventPublisher,
      nodeRepository,
    );
    nodeRepository.loadLocalNodeId.mockResolvedValue(
      new NodeId('550e8400-e29b-41d4-a716-446655440002'),
    );
    networkResolver.resolve.mockResolvedValue([
      '550e8400-e29b-41d4-a716-446655440001',
    ]);
  });

  it('stores heartbeat presence in the runtime repository', async () => {
    const identityId =
      'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=';

    await recorder.record(new IdentityPresenceHeartbeatMessage(identityId, true));

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        getIdentityId: expect.any(Function),
      }),
      ['550e8400-e29b-41d4-a716-446655440001'],
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('keeps selected status as heartbeat base', async () => {
    const identityId = new IdentityId(
      'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
    );
    const presence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: '550e8400-e29b-41d4-a716-446655440002',
      preferenceUpdatedAt: 1780000000000,
      selectedStatus: 'busy',
      status: 'busy',
      updatedAt: new Timestamp(1780000000000).valueOf(),
    });

    repository.findByIdentityIdAndNodeId.mockResolvedValue(presence);

    await recorder.record(
      new IdentityPresenceHeartbeatMessage(identityId.valueOf(), true),
    );

    const savedPresence = repository.save.mock.calls[0][0];

    expect(savedPresence.toPrimitives()).toEqual(
      expect.objectContaining({
        identityId: identityId.valueOf(),
        status: 'busy',
      }),
    );
  });

  it('publishes unchanged heartbeat ticks to renew the remote lease', async () => {
    const identityId = new IdentityId(
      'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
    );
    const availablePresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: '550e8400-e29b-41d4-a716-446655440002',
      preferenceUpdatedAt: 1780000000000,
      selectedStatus: 'available',
      lastActivityAt: 1780000000000,
      lastHeartbeatAt: 1780000000000,
      status: 'available',
      updatedAt: 1780000000000,
    });

    repository.findByIdentityIdAndNodeId.mockResolvedValue(availablePresence);

    await recorder.record(
      new IdentityPresenceHeartbeatMessage(identityId.valueOf(), true),
    );

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });
});
