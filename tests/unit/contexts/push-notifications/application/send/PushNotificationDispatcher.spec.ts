import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import MongoIdentityPresenceRepository from '@app/contexts/presence/infrastructure/mongo/MongoIdentityPresenceRepository';
import { PushNotificationDelivery } from '@app/contexts/push-notifications/application/send/PushNotificationDelivery';
import { PushNotificationDispatcher } from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { PushSubscription } from '@app/contexts/push-notifications/domain/PushSubscription';
import { PushSubscriptionRepository } from '@app/contexts/push-notifications/domain/repositories/PushSubscriptionRepository';
import { PushSubscriptionEndpoint } from '@app/contexts/push-notifications/domain/value-objects/PushSubscriptionEndpoint';
import { PushSubscriptionKey } from '@app/contexts/push-notifications/domain/value-objects/PushSubscriptionKey';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { KeyPair, Timestamp } from '@haskou/value-objects';

class TestDomainEvent extends DomainEvent {
  public eventName(): string {
    return String(this.attributes.eventName);
  }
}

describe('PushNotificationDispatcher', () => {
  it('sends conversation message push notifications to recipients only', async () => {
    const authorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const subscription = createSubscription(recipientIdentityId);
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      subscriptions: [subscription],
    });
    const event = new TestDomainEvent('conversation-id', {
      authorId: authorIdentityId.valueOf(),
      eventName: 'conversations.v1.message.was_sent',
      messageId: 'message-id',
      participantIds: [
        authorIdentityId.valueOf(),
        recipientIdentityId.valueOf(),
      ],
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).toHaveBeenCalledWith(
      subscription,
      expect.objectContaining({
        data: {
          conversationId: 'conversation-id',
          messageId: 'message-id',
        },
        type: 'message',
      }),
    );
  });

  it('does not send message push notifications when recipient is busy', async () => {
    const authorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      busyIdentityIds: [recipientIdentityId.valueOf()],
      delivery,
      subscriptions: [createSubscription(recipientIdentityId)],
    });
    const event = new TestDomainEvent('conversation-id', {
      authorId: authorIdentityId.valueOf(),
      eventName: 'conversations.v1.message.was_sent',
      messageId: 'message-id',
      participantIds: [
        authorIdentityId.valueOf(),
        recipientIdentityId.valueOf(),
      ],
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).not.toHaveBeenCalled();
  });

  it('keeps invitation push notifications while recipient is busy', async () => {
    const recipientIdentityId = await generateIdentityId();
    const subscription = createSubscription(recipientIdentityId);
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      busyIdentityIds: [recipientIdentityId.valueOf()],
      delivery,
      subscriptions: [subscription],
    });
    const event = new TestDomainEvent('notification-id', {
      eventName: 'notifications.v1.notification.was_created',
      recipientIdentityId: recipientIdentityId.valueOf(),
      type: 'conversation_invitation',
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).toHaveBeenCalledWith(
      subscription,
      expect.objectContaining({
        type: 'notification',
      }),
    );
  });

  it('removes gone subscriptions after a failed delivery', async () => {
    const recipientIdentityId = await generateIdentityId();
    const subscription = createSubscription(recipientIdentityId);
    const delivery = mockDelivery(false);
    const repository = mockRepository([subscription]);
    const dispatcher = createDispatcher({
      delivery,
      repository,
      subscriptions: [subscription],
    });
    const event = new TestDomainEvent('notification-id', {
      eventName: 'notifications.v1.notification.was_created',
      recipientIdentityId: recipientIdentityId.valueOf(),
      type: 'conversation_invitation',
    });

    await dispatcher.dispatch(event);

    expect(repository.deleteByEndpoint).toHaveBeenCalledWith(
      subscription.getEndpoint(),
    );
  });
});

async function generateIdentityId(): Promise<IdentityId> {
  const keyPair = await KeyPair.generate();

  return new IdentityId(keyPair.toPrimitives().publicKey);
}

function createSubscription(identityId: IdentityId): PushSubscription {
  return PushSubscription.register(
    identityId,
    new PushSubscriptionEndpoint(`https://push.test/${identityId.valueOf()}`),
    new PushSubscriptionKey('p256dh-key'),
    new PushSubscriptionKey('auth-secret'),
    undefined,
    new Timestamp(1770000000000),
  );
}

function createBusyPresence(identityId: string): IdentityPresence {
  return IdentityPresence.fromPrimitives({
    identityId,
    status: 'busy',
    updatedAt: 1770000000000,
  });
}

function mockDelivery(result: boolean): PushNotificationDelivery {
  return {
    send: jest.fn().mockResolvedValue(result),
  };
}

function mockPresenceRepository(
  busyIdentityIds: string[],
): MongoIdentityPresenceRepository {
  return {
    findByIdentityId: jest.fn(async (identityId: IdentityId) =>
      busyIdentityIds.includes(identityId.valueOf())
        ? createBusyPresence(identityId.valueOf())
        : undefined,
    ),
  } as unknown as MongoIdentityPresenceRepository;
}

function mockRepository(
  subscriptions: PushSubscription[],
): PushSubscriptionRepository {
  return {
    delete: jest.fn(),
    deleteByEndpoint: jest.fn(),
    findByIdentityId: jest.fn(async (identityId: IdentityId) =>
      subscriptions.filter((subscription) => subscription.belongsTo(identityId)),
    ),
    save: jest.fn(),
  };
}

function createDispatcher(options: {
  busyIdentityIds?: string[];
  delivery: PushNotificationDelivery;
  repository?: PushSubscriptionRepository;
  subscriptions: PushSubscription[];
}): PushNotificationDispatcher {
  return new PushNotificationDispatcher(
    options.repository ?? mockRepository(options.subscriptions),
    mockPresenceRepository(options.busyIdentityIds ?? []),
    options.delivery,
  );
}
