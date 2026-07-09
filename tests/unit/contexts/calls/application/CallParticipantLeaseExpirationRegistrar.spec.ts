import CallParticipantLeaseExpirationRegistrar from '@app/contexts/calls/application/expire-participant-leases/CallParticipantLeaseExpirationRegistrar';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

describe('CallParticipantLeaseExpirationRegistrar', () => {
  const localNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');
  const remoteNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440013');

  it('publishes expiration only for the local node lease', async () => {
    const repository = mock<CallParticipantLeaseRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const nodeRepository = mock<NodeRepository>();
    repository.findPotentiallyExpired.mockResolvedValue([
      lease(localNodeId),
      lease(remoteNodeId),
    ]);
    nodeRepository.loadLocalNodeId.mockResolvedValue(localNodeId);
    const registrar = new CallParticipantLeaseExpirationRegistrar(
      repository,
      eventPublisher,
      nodeRepository,
    );

    await registrar.expire();

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.purgeDisconnectedBefore).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });
});

function lease(nodeId: NodeId): CallParticipantLease {
  return CallParticipantLease.connect(
    new CallId('550e8400-e29b-41d4-a716-446655440010'),
    new IdentityId(
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
    ),
    nodeId,
    new NetworkId('550e8400-e29b-41d4-a716-446655440011'),
    [
      new IdentityId(
        'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
      ),
    ],
    [],
    new Timestamp(1),
  );
}
