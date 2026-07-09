import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import InMemoryIdentityPresenceRepository from '@app/contexts/presence/infrastructure/memory/InMemoryIdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

describe('InMemoryIdentityPresenceRepository', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
  );
  const firstNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440001');
  const secondNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440002');

  it('finds potentially expired runtime presences from memory', async () => {
    const repository = new InMemoryIdentityPresenceRepository();
    const presence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: firstNodeId.valueOf(),
      preferenceUpdatedAt: 100,
      selectedStatus: 'available',
      lastHeartbeatAt: 100,
      status: 'available',
      updatedAt: 100,
    });

    await repository.save(presence);

    await expect(
      repository.findPotentiallyExpired(new Timestamp(200)),
    ).resolves.toHaveLength(1);
  });

  it('ignores stale snapshots when a newer presence is already stored', async () => {
    const repository = new InMemoryIdentityPresenceRepository();
    const newerPresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: firstNodeId.valueOf(),
      preferenceUpdatedAt: 300,
      selectedStatus: 'available',
      lastHeartbeatAt: 300,
      status: 'available',
      updatedAt: 300,
    });
    const olderPresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      ownerNodeId: firstNodeId.valueOf(),
      preferenceUpdatedAt: 100,
      selectedStatus: 'busy',
      lastHeartbeatAt: 100,
      status: 'busy',
      updatedAt: 100,
    });

    await repository.save(newerPresence);
    await repository.save(olderPresence);

    const storedPresence = await repository.findByIdentityId(identityId);

    expect(storedPresence?.toPrimitives()).toEqual(
      expect.objectContaining({
        lastHeartbeatAt: 300,
        status: 'available',
        updatedAt: 300,
      }),
    );
  });

  it('keeps independent leases when the same identity connects through two nodes', async () => {
    const repository = new InMemoryIdentityPresenceRepository();
    const firstNodePresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      lastHeartbeatAt: 100,
      ownerNodeId: firstNodeId.valueOf(),
      preferenceUpdatedAt: 300,
      selectedStatus: 'available',
      status: 'disconnected',
      updatedAt: 300,
    });
    const secondNodePresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      lastHeartbeatAt: 200,
      ownerNodeId: secondNodeId.valueOf(),
      preferenceUpdatedAt: 200,
      selectedStatus: 'available',
      status: 'available',
      updatedAt: 200,
    });

    await repository.save(firstNodePresence);
    await repository.save(secondNodePresence);

    const effectivePresence = await repository.findByIdentityId(identityId);
    const firstLease = await repository.findByIdentityIdAndNodeId(
      identityId,
      firstNodeId,
    );

    expect(effectivePresence?.isConnected()).toBe(true);
    expect(firstLease?.belongsToNode(firstNodeId)).toBe(true);
  });

  it('keeps the newest selected preference when a later heartbeat arrives from another node', async () => {
    const repository = new InMemoryIdentityPresenceRepository();
    const selectedBusyPresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      lastHeartbeatAt: 400,
      ownerNodeId: firstNodeId.valueOf(),
      preferenceUpdatedAt: 500,
      selectedStatus: 'busy',
      status: 'busy',
      updatedAt: 500,
    });
    const laterAvailableHeartbeat = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
      lastHeartbeatAt: 600,
      ownerNodeId: secondNodeId.valueOf(),
      preferenceUpdatedAt: 200,
      selectedStatus: 'available',
      status: 'available',
      updatedAt: 600,
    });

    await repository.save(selectedBusyPresence);
    await repository.save(laterAvailableHeartbeat);

    const effectivePresence = await repository.findByIdentityId(identityId);

    expect(effectivePresence?.isBusy()).toBe(true);
  });
});
