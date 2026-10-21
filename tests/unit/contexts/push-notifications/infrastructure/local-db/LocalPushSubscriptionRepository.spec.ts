import LocalPushSubscriptionRepository from '@app/contexts/push-notifications/infrastructure/local-db/LocalPushSubscriptionRepository';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalPushSubscriptionRepository', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );
  let database: MockProxy<EmbeddedLocalDatabase>;
  let repository: LocalPushSubscriptionRepository;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    repository = new LocalPushSubscriptionRepository(database);
  });

  const validSubscription = {
    _id: 'https://web.push.apple.com/send/subscription-id',
    auth: 'auth-secret',
    createdAt: 1770000000000,
    endpoint: 'https://web.push.apple.com/send/subscription-id',
    identityId: identityId.valueOf(),
    p256dh: 'p256dh-secret',
  };

  it('hydrates stored subscriptions of the identity', async () => {
    database.find.mockResolvedValue([validSubscription]);

    const subscriptions = await repository.findByIdentityId(identityId);

    expect(subscriptions.map((value) => value.getEndpoint().valueOf())).toEqual(
      [validSubscription.endpoint],
    );
  });

  it.each([
    [
      'is rejected by the domain',
      {
        _id: 'https://attacker.example/internal/metadata',
        endpoint: 'https://attacker.example/internal/metadata',
      },
    ],
    ['fails the stored shape', { auth: 7 }],
  ])(
    'keeps a stored subscription that %s and answers 503020 instead of a partial list',
    async (_case, corruption) => {
      database.find.mockResolvedValue([
        { ...validSubscription, ...corruption },
        validSubscription,
      ]);

      await expect(
        repository.findByIdentityId(identityId),
      ).rejects.toMatchObject({
        code: ReplicatedStateNotReadyError.CODE,
        httpCode: 503,
      });
      expect(database.delete).not.toHaveBeenCalled();
      expect(database.save).not.toHaveBeenCalled();
    },
  );
});
