import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { NotificationDeliveryShouldSendPushMessage } from '@app/contexts/notification-settings/application/should-deliver/messages/NotificationDeliveryShouldSendPushMessage';
import { NotificationDeliveryPreferenceChecker } from '@app/contexts/notification-settings/application/should-deliver/NotificationDeliveryPreferenceChecker';
import { NotificationSettingScopeType } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScopeType';
import MongoIdentityPresenceRepository from '@app/contexts/presence/infrastructure/mongo/MongoIdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { PushSubscriptionRepository } from '../../domain/repositories/PushSubscriptionRepository';
import { PushNotificationDelivery } from './PushNotificationDelivery';
import { PushNotificationIntent } from './types/PushNotificationIntent';
import { PushNotificationScope } from './types/PushNotificationScope';

export class PushNotificationDispatcher {
  private static identityIdsFrom(value: unknown): IdentityId[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (identityId): identityId is string => typeof identityId === 'string',
      )
      .map((identityId) => new IdentityId(identityId));
  }

  private static optionalIdentityId(value: unknown): IdentityId | undefined {
    return typeof value === 'string' ? new IdentityId(value) : undefined;
  }

  private static unreadMessageFromEvent(
    event: DomainEvent,
  ): PushNotificationIntent['unreadMessage'] {
    const messageId = event.attributes.messageId;

    if (typeof messageId !== 'string') {
      return undefined;
    }

    return {
      conversationId: new ConversationId(event.aggregateId),
      messageId: new MessageId(messageId),
    };
  }

  private static objectField(value: object, field: string): unknown {
    return Object.entries(value).find(([key]) => key === field)?.[1];
  }

  private static scopeFromCallScope(value: unknown): PushNotificationScope {
    if (!value || typeof value !== 'object') {
      return {
        conversationId: '',
        type: NotificationSettingScopeType.CONVERSATION,
      };
    }

    const type = PushNotificationDispatcher.objectField(value, 'type');
    const communityId = PushNotificationDispatcher.objectField(
      value,
      'communityId',
    );
    const channelId = PushNotificationDispatcher.objectField(
      value,
      'channelId',
    );
    const conversationId = PushNotificationDispatcher.objectField(
      value,
      'conversationId',
    );

    if (
      type === NotificationSettingScopeType.COMMUNITY_CHANNEL &&
      typeof communityId === 'string' &&
      typeof channelId === 'string'
    ) {
      return {
        channelId,
        communityId,
        type: NotificationSettingScopeType.COMMUNITY_CHANNEL,
      };
    }

    return {
      conversationId: typeof conversationId === 'string' ? conversationId : '',
      type: NotificationSettingScopeType.CONVERSATION,
    };
  }

  constructor(
    private readonly subscriptionRepository: PushSubscriptionRepository,
    private readonly presenceRepository: MongoIdentityPresenceRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly delivery: PushNotificationDelivery,
    private readonly preferenceChecker: NotificationDeliveryPreferenceChecker,
  ) {}

  private withoutActor(
    identityIds: IdentityId[],
    actorIdentityId: IdentityId | undefined,
  ): IdentityId[] {
    if (!actorIdentityId) {
      return identityIds;
    }

    return identityIds.filter((identityId) =>
      identityId.isNotEqual(actorIdentityId),
    );
  }

  private messageIntent(event: DomainEvent): PushNotificationIntent {
    const actorIdentityId = PushNotificationDispatcher.optionalIdentityId(
      event.attributes.authorId,
    );
    const recipientIdentityIds = this.withoutActor(
      PushNotificationDispatcher.identityIdsFrom(
        event.attributes.participantIds,
      ),
      actorIdentityId,
    );

    return {
      mentionsEveryoneOrHere: Boolean(event.attributes.mentionsEveryoneOrHere),
      mentionsRecipientIdentityIds: PushNotificationDispatcher.identityIdsFrom(
        event.attributes.mentionedIdentityIds,
      ),
      mentionsRoleIdentityIds: PushNotificationDispatcher.identityIdsFrom(
        event.attributes.mentionedRoleMemberIds,
      ),
      payload: {
        body: 'You have a new message.',
        data: {
          conversationId: event.aggregateId,
          messageId: event.attributes.messageId,
        },
        tag: `conversation:${event.aggregateId}`,
        title: 'New message',
        type: 'message',
      },
      recipientIdentityIds,
      respectBusy: true,
      respectPreferences: true,
      scope: {
        conversationId: event.aggregateId,
        type: NotificationSettingScopeType.CONVERSATION,
      },
      unreadMessage: PushNotificationDispatcher.unreadMessageFromEvent(event),
    };
  }

  private communityMessageIntent(event: DomainEvent): PushNotificationIntent {
    const actorIdentityId = PushNotificationDispatcher.optionalIdentityId(
      event.attributes.authorIdentityId,
    );
    const recipientIdentityIds = this.withoutActor(
      PushNotificationDispatcher.identityIdsFrom(event.attributes.memberIds),
      actorIdentityId,
    );

    return {
      mentionsEveryoneOrHere: Boolean(event.attributes.mentionsEveryoneOrHere),
      mentionsRecipientIdentityIds: PushNotificationDispatcher.identityIdsFrom(
        event.attributes.mentionedIdentityIds,
      ),
      mentionsRoleIdentityIds: PushNotificationDispatcher.identityIdsFrom(
        event.attributes.mentionedRoleMemberIds,
      ),
      payload: {
        body: 'You have a new community message.',
        data: {
          channelId: event.attributes.channelId,
          communityId: event.aggregateId,
          messageId: event.attributes.messageId,
        },
        tag: `community:${event.aggregateId}:${String(event.attributes.channelId)}`,
        title: 'New community message',
        type: 'message',
      },
      recipientIdentityIds,
      respectBusy: true,
      respectPreferences: true,
      scope: {
        channelId: String(event.attributes.channelId),
        communityId: event.aggregateId,
        type: NotificationSettingScopeType.COMMUNITY_CHANNEL,
      },
    };
  }

  private notificationIntent(event: DomainEvent): PushNotificationIntent {
    const recipientIdentityId = PushNotificationDispatcher.optionalIdentityId(
      event.attributes.recipientIdentityId,
    );
    const notificationType = String(event.attributes.type);
    const isCallNotification = notificationType === 'missed_call';

    return {
      mentionsEveryoneOrHere: false,
      mentionsRecipientIdentityIds: [],
      mentionsRoleIdentityIds: [],
      payload: {
        body: this.notificationBody(notificationType),
        data: {
          notificationId: event.aggregateId,
          notificationType,
        },
        tag: `notification:${event.aggregateId}`,
        title: this.notificationTitle(notificationType),
        type: isCallNotification ? 'call' : 'notification',
      },
      recipientIdentityIds: recipientIdentityId ? [recipientIdentityId] : [],
      respectBusy: isCallNotification,
      respectPreferences: true,
      scope: {
        conversationId: event.aggregateId,
        type: NotificationSettingScopeType.CONVERSATION,
      },
    };
  }

  private callIntent(event: DomainEvent): PushNotificationIntent {
    const creatorIdentityId = PushNotificationDispatcher.optionalIdentityId(
      event.attributes.creatorIdentityId,
    );
    const recipientIdentityIds = this.withoutActor(
      PushNotificationDispatcher.identityIdsFrom(
        event.attributes.participantIds,
      ),
      creatorIdentityId,
    );

    return {
      mentionsEveryoneOrHere: false,
      mentionsRecipientIdentityIds: [],
      mentionsRoleIdentityIds: [],
      payload: {
        body: 'Someone is calling you.',
        data: {
          callId: event.aggregateId,
          scope: event.attributes.scope,
        },
        tag: `call:${event.aggregateId}`,
        title: 'Incoming call',
        type: 'call',
      },
      recipientIdentityIds,
      respectBusy: true,
      respectPreferences: true,
      scope: PushNotificationDispatcher.scopeFromCallScope(
        event.attributes.scope,
      ),
    };
  }

  private clearConversationNotificationsIntent(
    event: DomainEvent,
  ): PushNotificationIntent {
    const readerIdentityId = PushNotificationDispatcher.optionalIdentityId(
      event.attributes.readerIdentityId,
    );
    const tag = `conversation:${event.aggregateId}`;

    return {
      mentionsEveryoneOrHere: false,
      mentionsRecipientIdentityIds: [],
      mentionsRoleIdentityIds: [],
      payload: {
        body: '',
        data: {
          conversationId: event.aggregateId,
          messageId: event.attributes.messageId,
          scope: {
            conversationId: event.aggregateId,
            type: NotificationSettingScopeType.CONVERSATION,
          },
          tags: [tag],
        },
        tag,
        tags: [tag],
        title: 'Notifications updated',
        type: 'notifications_cleared',
      },
      recipientIdentityIds: readerIdentityId ? [readerIdentityId] : [],
      respectBusy: false,
      respectPreferences: false,
      scope: {
        conversationId: event.aggregateId,
        type: NotificationSettingScopeType.CONVERSATION,
      },
    };
  }

  private notificationBody(notificationType: string): string {
    if (notificationType === 'missed_call') {
      return 'You missed a call.';
    }

    return 'You have a new invitation.';
  }

  private notificationTitle(notificationType: string): string {
    if (notificationType === 'missed_call') {
      return 'Missed call';
    }

    return 'New invitation';
  }

  private intentFor(event: DomainEvent): PushNotificationIntent | undefined {
    switch (event.eventName()) {
      case 'conversations.v1.message.was_sent':
        return this.messageIntent(event);
      case 'communities.v1.channel.message.was_sent':
        return this.communityMessageIntent(event);
      case 'notifications.v1.notification.was_created':
        return this.notificationIntent(event);
      case 'calls.v1.call.started':
        return this.callIntent(event);
      case 'conversations.v1.messages.were_read':
        return this.clearConversationNotificationsIntent(event);
      default:
        return undefined;
    }
  }

  private async shouldSkipForBusy(
    identityId: IdentityId,
    respectBusy: boolean,
  ): Promise<boolean> {
    if (!respectBusy) {
      return false;
    }

    const presence = await this.presenceRepository.findByIdentityId(identityId);

    return presence?.isBusy() || false;
  }

  private async shouldSkipForReadMessage(
    identityId: IdentityId,
    intent: PushNotificationIntent,
  ): Promise<boolean> {
    if (!intent.unreadMessage) {
      return false;
    }

    return !(await this.conversationRepository.hasUnreadMessageForRecipient(
      identityId,
      intent.unreadMessage.conversationId,
      intent.unreadMessage.messageId,
    ));
  }

  private async sendToIdentity(
    identityId: IdentityId,
    intent: PushNotificationIntent,
  ): Promise<void> {
    if (await this.shouldSkipForBusy(identityId, intent.respectBusy)) {
      return;
    }

    if (await this.shouldSkipForReadMessage(identityId, intent)) {
      return;
    }

    if (intent.respectPreferences) {
      const shouldSendPush = await this.preferenceChecker.shouldSendPush(
        new NotificationDeliveryShouldSendPushMessage(
          identityId.valueOf(),
          intent.scope,
          intent.mentionsRecipientIdentityIds.some((mentionedIdentityId) =>
            mentionedIdentityId.isEqual(identityId),
          ),
          intent.mentionsEveryoneOrHere,
          intent.mentionsRoleIdentityIds.some((mentionedRoleIdentityId) =>
            mentionedRoleIdentityId.isEqual(identityId),
          ),
        ),
      );

      if (!shouldSendPush) {
        return;
      }
    }

    const subscriptions =
      await this.subscriptionRepository.findByIdentityId(identityId);

    for (const subscription of subscriptions) {
      const deliveryResult = await this.delivery.send(
        subscription,
        intent.payload,
      );

      if (deliveryResult.shouldDeleteSubscription) {
        await this.subscriptionRepository.deleteByEndpoint(
          subscription.getEndpoint(),
        );
      }
    }
  }

  public async dispatch(event: DomainEvent): Promise<void> {
    const intent = this.intentFor(event);

    if (!intent) {
      return;
    }

    for (const recipientIdentityId of intent.recipientIdentityIds) {
      await this.sendToIdentity(recipientIdentityId, intent);
    }
  }
}
