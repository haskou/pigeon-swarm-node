import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

describe('InMemoryCallParticipantLeaseRepository', () => {
  const callId = new CallId('550e8400-e29b-41d4-a716-446655440010');
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440011');
  const firstNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');
  const secondNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440013');

  it('keeps independent leases for the same participant on different nodes', async () => {
    const repository = new InMemoryCallParticipantLeaseRepository();

    await repository.save(lease(firstNodeId, 100));
    await repository.save(lease(secondNodeId, 200));

    await expect(repository.findByCallIds([callId])).resolves.toHaveLength(2);
  });

  it('keeps a short-lived disconnect tombstone and rejects stale renewal snapshots', async () => {
    const repository = new InMemoryCallParticipantLeaseRepository();
    const participantLease = lease(firstNodeId, 100);
    const staleLease = lease(firstNodeId, 150);

    await repository.save(participantLease);
    participantLease.disconnect(new Timestamp(200));
    await repository.save(participantLease);
    await repository.save(staleLease);

    const stored = await repository.findByCallIds([callId]);

    expect(stored).toHaveLength(1);
    expect(stored[0].isConnected()).toBe(false);

    await repository.purgeDisconnectedBefore(new Timestamp(200));
    await expect(repository.findByCallIds([callId])).resolves.toHaveLength(0);
  });

  function lease(nodeId: NodeId, heartbeatAt: number): CallParticipantLease {
    return CallParticipantLease.connect(
      callId,
      identityId,
      nodeId,
      networkId,
      [identityId],
      [],
      new Timestamp(heartbeatAt),
    );
  }
});
