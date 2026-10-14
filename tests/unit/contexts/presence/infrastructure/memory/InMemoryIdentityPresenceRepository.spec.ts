import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { IdentityPresenceNotFoundError } from '@app/contexts/presence/domain/errors/IdentityPresenceNotFoundError';
import InMemoryIdentityPresenceRepository from '@app/contexts/presence/infrastructure/memory/InMemoryIdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('InMemoryIdentityPresenceRepository', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAq3hAwZS8E8LE8Z+qoSHj8U5RF9Ky+fKDgT/spDURDkc=',
  );

  it('finds potentially expired runtime presences from memory', async () => {
    const repository = new InMemoryIdentityPresenceRepository();

    await repository.save(
      IdentityPresence.fromPrimitives({
        identityId: identityId.valueOf(),
        preferenceUpdatedAt: 100,
        selectedStatus: 'available',
        lastHeartbeatAt: 100,
        status: 'available',
        updatedAt: 100,
      }),
    );

    await expect(
      repository.findPotentiallyExpired(new Timestamp(200)),
    ).resolves.toHaveLength(1);
  });

  it('keeps one lease per identity and returns the latest saved state', async () => {
    const repository = new InMemoryIdentityPresenceRepository();

    await repository.save(
      IdentityPresence.fromPrimitives({
        identityId: identityId.valueOf(),
        lastHeartbeatAt: 100,
        preferenceUpdatedAt: 100,
        selectedStatus: 'available',
        status: 'available',
        updatedAt: 100,
      }),
    );
    await repository.save(
      IdentityPresence.fromPrimitives({
        identityId: identityId.valueOf(),
        lastHeartbeatAt: 300,
        preferenceUpdatedAt: 300,
        selectedStatus: 'busy',
        status: 'busy',
        updatedAt: 300,
      }),
    );

    await expect(
      repository.findByIdentityIds([identityId]),
    ).resolves.toHaveLength(1);
    expect((await repository.requireByIdentityId(identityId)).isBusy()).toBe(
      true,
    );
  });

  it('reports absence through has and rejects require when nothing is stored', async () => {
    const repository = new InMemoryIdentityPresenceRepository();

    await expect(repository.hasByIdentityId(identityId)).resolves.toBe(false);
    await expect(
      repository.requireByIdentityId(identityId),
    ).rejects.toBeInstanceOf(IdentityPresenceNotFoundError);
  });
});
