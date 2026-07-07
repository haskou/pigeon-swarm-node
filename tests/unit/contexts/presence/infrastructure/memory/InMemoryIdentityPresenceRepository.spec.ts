import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import InMemoryIdentityPresenceRepository from '@app/contexts/presence/infrastructure/memory/InMemoryIdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('InMemoryIdentityPresenceRepository', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
  );

  it('finds potentially expired runtime presences from memory', async () => {
    const repository = new InMemoryIdentityPresenceRepository();
    const presence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
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
      lastHeartbeatAt: 300,
      status: 'available',
      updatedAt: 300,
    });
    const olderPresence = IdentityPresence.fromPrimitives({
      identityId: identityId.valueOf(),
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
});
