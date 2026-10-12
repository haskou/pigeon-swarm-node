import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { IdentityPresenceNotFoundError } from '@app/contexts/presence/domain/errors/IdentityPresenceNotFoundError';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import NotificationDeliveryPreferenceChecker from '@app/contexts/notification-settings/application/should-deliver/NotificationDeliveryPreferenceChecker';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsNotFoundError } from '@app/contexts/notification-settings/domain/errors/NotificationScopeSettingsNotFoundError';
import NotificationScopeSettingsRepository from '@app/contexts/notification-settings/domain/repositories/NotificationScopeSettingsRepository';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import PushNotificationDelivery from '@app/contexts/push-notifications/application/send/PushNotificationDelivery';
import { PushNotificationDeliveryResult } from '@app/contexts/push-notifications/application/send/PushNotificationDeliveryResult';
import { PushNotificationPayload } from '@app/contexts/push-notifications/application/send/PushNotificationPayload';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { PushSubscription } from '@app/contexts/push-notifications/domain/PushSubscription';
import PushSubscriptionRepository from '@app/contexts/push-notifications/domain/repositories/PushSubscriptionRepository';
import { PushSubscriptionEndpoint } from '@app/contexts/push-notifications/domain/value-objects/PushSubscriptionEndpoint';
import { PushSubscriptionKey } from '@app/contexts/push-notifications/domain/value-objects/PushSubscriptionKey';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

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
        type: 'message',
      }),
    );
  });

  it('keeps social and message identifiers out of message push payloads', async () => {
    const authorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
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

    const payload = sentPayload(delivery);

    expect(payload).not.toHaveProperty('data');
    expectNoIdentifiers(payload, [
      'conversation-id',
      'message-id',
      authorIdentityId.valueOf(),
      recipientIdentityId.valueOf(),
    ]);
  });

  it('keeps community channel identifiers out of channel message push payloads', async () => {
    const authorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      subscriptions: [createSubscription(recipientIdentityId)],
    });
    const event = new TestDomainEvent('community-id', {
      authorIdentityId: authorIdentityId.valueOf(),
      channelId: 'channel-id',
      eventName: 'communities.v1.channel.message.was_sent',
      memberIds: [authorIdentityId.valueOf(), recipientIdentityId.valueOf()],
      messageId: 'message-id',
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).toHaveBeenCalledTimes(1);
    expect(sentPayload(delivery)).not.toHaveProperty('data');
    expectNoIdentifiers(sentPayload(delivery), [
      'community-id',
      'channel-id',
      'message-id',
    ]);
  });

  it('keeps call and scope identifiers out of call push payloads', async () => {
    const creatorIdentityId = await generateIdentityId();
    const recipientIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      subscriptions: [createSubscription(recipientIdentityId)],
    });
    const event = new TestDomainEvent('call-id', {
      creatorIdentityId: creatorIdentityId.valueOf(),
      eventName: 'calls.v1.call.started',
      participantIds: [
        creatorIdentityId.valueOf(),
        recipientIdentityId.valueOf(),
      ],
      scope: {
        conversationId: 'conversation-id',
        type: 'conversation',
      },
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).toHaveBeenCalledTimes(1);
    expect(sentPayload(delivery)).not.toHaveProperty('data');
    expectNoIdentifiers(sentPayload(delivery), [
      'call-id',
      'conversation-id',
      creatorIdentityId.valueOf(),
    ]);
  });

  it('keeps notification identifiers out of invitation push payloads', async () => {
    const recipientIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      subscriptions: [createSubscription(recipientIdentityId)],
    });
    const event = new TestDomainEvent('notification-id', {
      eventName: 'notifications.v1.notification.was_created',
      recipientIdentityId: recipientIdentityId.valueOf(),
      type: 'conversation_invitation',
    });

    await dispatcher.dispatch(event);

    expect(delivery.send).toHaveBeenCalledTimes(1);
    expect(sentPayload(delivery)).not.toHaveProperty('data');
    expectNoIdentifiers(sentPayload(delivery), [
      'notification-id',
      recipientIdentityId.valueOf(),
    ]);
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
    const payload = sentPayload(delivery);

    expect(payload).toEqual(
      expect.objectContaining({
        tag: expect.any(String),
        tags: [payload.tag],
        type: 'notifications_cleared',
      }),
    );
    expect(payload).not.toHaveProperty('data');
    expectNoIdentifiers(payload, ['conversation-id', 'message-id']);
  });

  it('groups a conversation message and its clear push under the same opaque tag', async () => {
    const authorIdentityId = await generateIdentityId();
    const readerIdentityId = await generateIdentityId();
    const delivery = mockDelivery(true);
    const dispatcher = createDispatcher({
      delivery,
      subscriptions: [createSubscription(readerIdentityId)],
    });

    await dispatcher.dispatch(
      new TestDomainEvent('conversation-id', {
        authorId: authorIdentityId.valueOf(),
        eventName: 'conversations.v1.message.was_sent',
        messageId: 'message-id',
        participantIds: [
          authorIdentityId.valueOf(),
          readerIdentityId.valueOf(),
        ],
      }),
    );
    await dispatcher.dispatch(
      new TestDomainEvent('conversation-id', {
        eventName: 'conversations.v1.messages.were_read',
        messageId: 'message-id',
        participantIds: [
          authorIdentityId.valueOf(),
          readerIdentityId.valueOf(),
        ],
        readerIdentityId: readerIdentityId.valueOf(),
      }),
    );

    const [messagePayload, clearPayload] = (
      delivery.send as jest.Mock
    ).mock.calls.map(([, payload]) => payload);

    expect(messagePayload.tag).toEqual(expect.any(String));
    expect(messagePayload.tag).not.toContain('conversation-id');
    expect(clearPayload.tags).toEqual([messagePayload.tag]);
    expect(clearPayload.tag).toBe(messagePayload.tag);
  });
});

function sentPayload(
  delivery: PushNotificationDelivery,
): PushNotificationPayload {
  const [call] = (delivery.send as jest.Mock).mock.calls;

  return call[1] as PushNotificationPayload;
}

function expectNoIdentifiers(
  payload: PushNotificationPayload,
  identifiers: string[],
): void {
  const serialized = JSON.stringify(payload);

  for (const identifier of identifiers) {
    expect(serialized).not.toContain(identifier);
  }
}

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
    preferenceUpdatedAt: 1770000000000,
    selectedStatus: 'busy',
    status: 'busy',
    updatedAt: 1770000000000,
  });
}

function createAvailablePresence(identityId: string): IdentityPresence {
  return IdentityPresence.fromPrimitives({
    identityId,
    lastActivityAt: 1770000000000,
    lastHeartbeatAt: 1770000000000,
    preferenceUpdatedAt: 1770000000000,
    selectedStatus: 'available',
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
  const presenceOf = (
    identityId: IdentityId,
  ): IdentityPresence | undefined => {
    if (options.busyIdentityIds.includes(identityId.valueOf())) {
      return createBusyPresence(identityId.valueOf());
    }

    return options.presences.find((presence) =>
      presence.getIdentityId().isEqual(identityId),
    );
  };

  return {
    hasByIdentityId: jest.fn(
      async (identityId: IdentityId): Promise<boolean> =>
        presenceOf(identityId) !== undefined,
    ),
    requireByIdentityId: jest.fn(
      async (identityId: IdentityId): Promise<IdentityPresence> => {
        const presence = presenceOf(identityId);

        if (!presence) {
          throw new IdentityPresenceNotFoundError();
        }

        return presence;
      },
    ),
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
    hasByScope: jest.fn(
      async (
        _identityId: IdentityId,
        _scope: NotificationSettingScope,
      ): Promise<boolean> => false,
    ),
    isPrivateScope: jest.fn(async (): Promise<boolean> => false),
    requireByScope: jest.fn(
      async (
        _identityId: IdentityId,
        _scope: NotificationSettingScope,
      ): Promise<NotificationScopeSettings> => {
        throw new NotificationScopeSettingsNotFoundError();
      },
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
