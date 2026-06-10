import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { MongoPushSubscriptionDocument } from '@app/contexts/push-notifications/infrastructure/mongo/documents/MongoPushSubscriptionDocument';
import MongoPushSubscriptionRepository from '@app/contexts/push-notifications/infrastructure/mongo/MongoPushSubscriptionRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

describe('MongoPushSubscriptionRepository', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoPushSubscriptionDocument>>;
  let repository: MongoPushSubscriptionRepository;

  beforeEach(() => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoPushSubscriptionDocument>>();
    repository = new MongoPushSubscriptionRepository(mongo);

    mongo.getCollection.mockResolvedValue(collection as never);
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

    collection.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        invalidSubscription,
        validSubscription,
      ]),
    } as never);

    const subscriptions = await repository.findByIdentityId(identityId);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].getEndpoint().valueOf()).toBe(
      validSubscription.endpoint,
    );
    expect(collection.deleteOne).toHaveBeenCalledWith({
      _id: invalidSubscription._id,
    });
  });
});
