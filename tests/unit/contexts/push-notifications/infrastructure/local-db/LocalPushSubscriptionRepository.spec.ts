import LocalPushSubscriptionRepository from '@app/contexts/push-notifications/infrastructure/local-db/LocalPushSubscriptionRepository';
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

  it('should ignore and remove invalid stored endpoints when listing subscriptions', async () => {
    const validSubscription = {
      _id: 'https://web.push.apple.com/send/subscription-id',
      auth: 'auth-secret',
      createdAt: 1770000000000,
      endpoint: 'https://web.push.apple.com/send/subscription-id',
      identityId: identityId.valueOf(),
      p256dh: 'p256dh-secret',
    };
    const invalidSubscription = {
      ...validSubscription,
      _id: 'https://attacker.example/internal/metadata',
      endpoint: 'https://attacker.example/internal/metadata',
    };

    database.find.mockResolvedValue([invalidSubscription, validSubscription]);

    const subscriptions = await repository.findByIdentityId(identityId);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].getEndpoint().valueOf()).toBe(
      validSubscription.endpoint,
    );
    expect(database.delete).toHaveBeenCalledWith(
      'push_subscriptions',
      invalidSubscription._id,
    );
  });
});
