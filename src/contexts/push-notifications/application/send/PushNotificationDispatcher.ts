import MongoIdentityPresenceRepository from '@app/contexts/presence/infrastructure/mongo/MongoIdentityPresenceRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { PushSubscriptionRepository } from '../../domain/repositories/PushSubscriptionRepository';
import { PushNotificationDelivery } from './PushNotificationDelivery';
import { PushNotificationPayload } from './PushNotificationPayload';

type PushNotificationIntent = {
  payload: PushNotificationPayload;
  respectBusy: boolean;
  recipientIdentityIds: IdentityId[];
};

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

  constructor(
    private readonly subscriptionRepository: PushSubscriptionRepository,
    private readonly presenceRepository: MongoIdentityPresenceRepository,
    private readonly delivery: PushNotificationDelivery,
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
    };
  }

  private notificationIntent(event: DomainEvent): PushNotificationIntent {
    const recipientIdentityId = PushNotificationDispatcher.optionalIdentityId(
      event.attributes.recipientIdentityId,
    );
    const notificationType = String(event.attributes.type);
    const isCallNotification = notificationType === 'missed_call';

    return {
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

  private async sendToIdentity(
    identityId: IdentityId,
    payload: PushNotificationPayload,
    respectBusy: boolean,
  ): Promise<void> {
    if (await this.shouldSkipForBusy(identityId, respectBusy)) {
      return;
    }

    const subscriptions =
      await this.subscriptionRepository.findByIdentityId(identityId);

    for (const subscription of subscriptions) {
      const deliveryResult = await this.delivery.send(subscription, payload);

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
      await this.sendToIdentity(
        recipientIdentityId,
        intent.payload,
        intent.respectBusy,
      );
    }
  }
}
