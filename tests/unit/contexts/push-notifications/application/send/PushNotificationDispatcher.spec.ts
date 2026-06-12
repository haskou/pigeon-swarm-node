import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import NotificationDeliveryPreferenceChecker from '@app/contexts/notification-settings/application/should-deliver/NotificationDeliveryPreferenceChecker';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import NotificationScopeSettingsRepository from '@app/contexts/notification-settings/domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import PushNotificationDelivery from '@app/contexts/push-notifications/application/send/PushNotificationDelivery';
import { PushNotificationDeliveryResult } from '@app/contexts/push-notifications/application/send/types/PushNotificationDeliveryResult';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { PushSubscription } from '@app/contexts/push-notifications/domain/PushSubscription';
import PushSubscriptionRepository from '@app/contexts/push-notifications/domain/repositories/PushSubscriptionRepository';
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

  it('sends push notifications even when websocket is connected', async () => {
    const authorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const subscription = createSubscription(recipientIdentityId);
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      presences: [createAvailablePresence(recipientIdentityId.valueOf())],
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
        type: 'message',
      }),
    );
  });

  it('does not send stale message pushes when the message was already read', async () => {
    const authorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      subscriptions: [createSubscription(recipientIdentityId)],
      unreadMessages: [],
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

  it('sends notification clear pushes only to the reader identity', async () => {
    const readerIdentityId = await generateIdentityId();
    const otherIdentityId = await generateIdentityId();
    const readerSubscription = createSubscription(readerIdentityId);
    const otherSubscription = createSubscription(otherIdentityId);
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      busyIdentityIds: [readerIdentityId.valueOf()],
      delivery,
      subscriptions: [readerSubscription, otherSubscription],
    });
    const event = new TestDomainEvent('conversation-id', {
      eventName: 'conversations.v1.messages.were_read',
      messageId: 'message-id',
      participantIds: [readerIdentityId.valueOf(), otherIdentityId.valueOf()],
      readerIdentityId: readerIdentityId.valueOf(),
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).toHaveBeenCalledTimes(1);
    expect(delivery.send).toHaveBeenCalledWith(
      readerSubscription,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conversation-id',
          messageId: 'message-id',
          tags: ['conversation:conversation-id'],
        }),
        tag: 'conversation:conversation-id',
        tags: ['conversation:conversation-id'],
        type: 'notifications_cleared',
      }),
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
    new PushSubscriptionEndpoint(
      `https://web.push.apple.com/${identityId.valueOf()}`,
    ),
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

function createAvailablePresence(identityId: string): IdentityPresence {
  return IdentityPresence.fromPrimitives({
    identityId,
    lastActivityAt: 1770000000000,
    lastHeartbeatAt: 1770000000000,
    status: 'available',
    updatedAt: 1770000000000,
  });
}

function mockDelivery(delivered: boolean): PushNotificationDelivery {
  return {
    send: jest.fn().mockResolvedValue(
      deliveryResult({
        delivered,
        shouldDeleteSubscription: !delivered,
      }),
    ),
  };
}

function deliveryResult(options: {
  delivered: boolean;
  shouldDeleteSubscription: boolean;
}): PushNotificationDeliveryResult {
  return {
    delivered: options.delivered,
    endpoint: 'https://web.push.apple.com/subscription',
    endpointHost: 'web.push.apple.com',
    shouldDeleteSubscription: options.shouldDeleteSubscription,
  };
}

function mockPresenceRepository(options: {
  busyIdentityIds: string[];
  presences: IdentityPresence[];
}): IdentityPresenceRepository {
  return {
    findByIdentityId: jest.fn(async (identityId: IdentityId) => {
      if (options.busyIdentityIds.includes(identityId.valueOf())) {
        return createBusyPresence(identityId.valueOf());
      }

      return options.presences.find((presence) =>
        presence.getIdentityId().isEqual(identityId),
      );
    }),
  } as unknown as IdentityPresenceRepository;
}

function mockRepository(
  subscriptions: PushSubscription[],
): PushSubscriptionRepository {
  return {
    delete: jest.fn(),
    deleteByEndpoint: jest.fn(),
    findByIdentityId: jest.fn(async (identityId: IdentityId) =>
      subscriptions.filter((subscription) =>
        subscription.belongsTo(identityId),
      ),
    ),
    save: jest.fn(),
  };
}

function mockConversationRepository(
  unreadMessages?: string[],
): ConversationRepository {
  return {
    hasUnreadMessageForRecipient: jest.fn(
      async (
        recipientIdentityId: IdentityId,
        conversationId,
        messageId,
      ): Promise<boolean> => {
        if (!unreadMessages) {
          return true;
        }

        return unreadMessages.includes(
          `${recipientIdentityId.valueOf()}:${conversationId.valueOf()}:${messageId.valueOf()}`,
        );
      },
    ),
  } as unknown as ConversationRepository;
}

function emptySettingsRepository(): NotificationScopeSettingsRepository {
  return {
    delete: jest.fn(),
    findByIdentityId: jest.fn(
      async (): Promise<NotificationScopeSettings[]> => [],
    ),
    findByScope: jest.fn(
      async (
        _identityId: IdentityId,
        _scope: NotificationSettingScope,
      ): Promise<NotificationScopeSettings | undefined> => undefined,
    ),
    save: jest.fn(),
  };
}

function createDispatcher(options: {
  busyIdentityIds?: string[];
  delivery: PushNotificationDelivery;
  presences?: IdentityPresence[];
  repository?: PushSubscriptionRepository;
  subscriptions: PushSubscription[];
  unreadMessages?: string[];
}): PushNotificationDispatcher {
  return new PushNotificationDispatcher(
    options.repository ?? mockRepository(options.subscriptions),
    mockPresenceRepository({
      busyIdentityIds: options.busyIdentityIds ?? [],
      presences: options.presences ?? [],
    }),
    mockConversationRepository(options.unreadMessages),
    options.delivery,
    new NotificationDeliveryPreferenceChecker(emptySettingsRepository()),
  );
}
