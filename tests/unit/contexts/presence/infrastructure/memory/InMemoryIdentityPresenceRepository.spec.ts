import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import InMemoryIdentityPresenceRepository from '@app/contexts/presence/infrastructure/memory/InMemoryIdentityPresenceRepository';
import { Timestamp } from '@haskou/value-objects';

describe('InMemoryIdentityPresenceRepository', () => {
  it('finds potentially expired runtime presences from memory', async () => {
    const repository = new InMemoryIdentityPresenceRepository();
    const presence = IdentityPresence.fromPrimitives({
      identityId:
        'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
      lastHeartbeatAt: 100,
      status: 'available',
      updatedAt: 100,
    });

    await repository.save(presence);

    await expect(
      repository.findPotentiallyExpired(new Timestamp(200)),
    ).resolves.toHaveLength(1);
  });
});
