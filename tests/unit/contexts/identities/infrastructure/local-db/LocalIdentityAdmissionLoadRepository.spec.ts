import LocalIdentityAdmissionLoadRepository from '@app/contexts/identities/infrastructure/local-db/LocalIdentityAdmissionLoadRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

const NETWORK = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_NETWORK = '550e8400-e29b-41d4-a716-446655440001';

describe('LocalIdentityAdmissionLoadRepository', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;
  let repository: LocalIdentityAdmissionLoadRepository;

  function storedWindows(
    windows: Record<string, { count: number; resetAt: number }>,
  ): void {
    database.findOne.mockImplementation(
      async (_namespace: string, key: string) =>
        (windows[key] ?? null) as never,
    );
  }

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    repository = new LocalIdentityAdmissionLoadRepository(database);
  });

  it('counts the admissions accepted into a network in the live window', async () => {
    storedWindows({ [NETWORK]: { count: 42, resetAt: Date.now() + 30_000 } });

    await expect(repository.countRecent(new NetworkId(NETWORK))).resolves.toBe(
      42,
    );
    expect(database.save).not.toHaveBeenCalled();
  });

  it('counts nothing once the window has elapsed or for unseen networks', async () => {
    storedWindows({ [NETWORK]: { count: 42, resetAt: Date.now() - 1 } });

    await expect(repository.countRecent(new NetworkId(NETWORK))).resolves.toBe(
      0,
    );
    await expect(
      repository.countRecent(new NetworkId(OTHER_NETWORK)),
    ).resolves.toBe(0);
  });

  it('records one admission per network, keyed only by network id', async () => {
    storedWindows({ [NETWORK]: { count: 2, resetAt: Date.now() + 30_000 } });

    await repository.record([
      new NetworkId(NETWORK),
      new NetworkId(OTHER_NETWORK),
    ]);

    expect(database.save).toHaveBeenCalledTimes(2);
    expect(database.save).toHaveBeenCalledWith(
      expect.any(String),
      NETWORK,
      expect.objectContaining({ count: 3 }),
    );
    expect(database.save).toHaveBeenCalledWith(
      expect.any(String),
      OTHER_NETWORK,
      expect.objectContaining({ count: 1 }),
    );
  });
});
