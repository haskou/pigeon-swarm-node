import IdentityPresenceExpirationRegistrar from '@app/contexts/presence/application/expire/IdentityPresenceExpirationRegistrar';
import IdentityPresenceNetworkResolver from '@app/contexts/presence/application/resolve-network/IdentityPresenceNetworkResolver';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

describe('IdentityPresenceExpirationRegistrar', () => {
  const localNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440001');
  const remoteNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440002');
  let repository: MockProxy<IdentityPresenceRepository>;
  let networkResolver: MockProxy<IdentityPresenceNetworkResolver>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let nodeRepository: MockProxy<NodeRepository>;
  let registrar: IdentityPresenceExpirationRegistrar;

  beforeEach(() => {
    repository = mock<IdentityPresenceRepository>();
    networkResolver = mock<IdentityPresenceNetworkResolver>();
    eventPublisher = mock<DomainEventPublisher>();
    nodeRepository = mock<NodeRepository>();
    nodeRepository.loadLocalNodeId.mockResolvedValue(localNodeId);
    networkResolver.resolve.mockResolvedValue(['network-id']);
    registrar = new IdentityPresenceExpirationRegistrar(
      repository,
      networkResolver,
      eventPublisher,
      nodeRepository,
    );
  });

  it('publishes expiration only for a lease owned by the local node', async () => {
    repository.findPotentiallyExpired.mockResolvedValue([
      expiredPresence(localNodeId),
    ]);

    await registrar.expire();

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('expires a remote lease locally without broadcasting on its behalf', async () => {
    repository.findPotentiallyExpired.mockResolvedValue([
      expiredPresence(remoteNodeId),
    ]);

    await registrar.expire();

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});

function expiredPresence(ownerNodeId: NodeId): IdentityPresence {
  return IdentityPresence.fromPrimitives({
    identityId:
      'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
    lastHeartbeatAt: 1,
    ownerNodeId: ownerNodeId.valueOf(),
    preferenceUpdatedAt: 1,
    selectedStatus: 'available',
    status: 'available',
    updatedAt: 1,
  });
}
