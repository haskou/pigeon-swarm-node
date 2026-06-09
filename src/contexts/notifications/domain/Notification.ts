import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityInvitationPayload } from './CommunityInvitationPayload';
import { ConversationInvitationPayload } from './ConversationInvitationPayload';
import { NotificationWasAcceptedEvent } from './events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from './events/NotificationWasCreatedEvent';
import { NotificationWasDeclinedEvent } from './events/NotificationWasDeclinedEvent';
import { MissedCallPayload } from './MissedCallPayload';
import { NotificationId } from './value-objects/NotificationId';
import { NotificationState } from './value-objects/NotificationState';
import { NotificationStatus } from './value-objects/NotificationStatus';
import { NotificationType } from './value-objects/NotificationType';

export class Notification extends AggregateRoot {
  private static recordCreated(notification: Notification): Notification {
    const primitives = notification.toPrimitives();

    notification.record(
      new NotificationWasCreatedEvent(primitives.id, {
        notification: primitives,
        recipientIdentityId: primitives.recipientIdentityId,
        type: primitives.type,
      }),
    );

    return notification;
  }

  private static payloadFromPrimitives(
    primitives: PrimitiveOf<Notification>['payload'],
  ):
    | CommunityInvitationPayload
    | ConversationInvitationPayload
    | MissedCallPayload {
    if ('communityId' in primitives) {
      return CommunityInvitationPayload.fromPrimitives(primitives);
    }

    if ('callId' in primitives) {
      return MissedCallPayload.fromPrimitives(primitives);
    }

    return ConversationInvitationPayload.fromPrimitives(primitives);
  }

  public static communityInvitation(
    payload: CommunityInvitationPayload,
    createdAt: Timestamp = Timestamp.now(),
    id: NotificationId = NotificationId.generate(),
  ): Notification {
    const notification = new Notification(
      id,
      NotificationType.COMMUNITY_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
      createdAt,
    );

    return Notification.recordCreated(notification);
  }

  public static conversationInvitation(
    payload: ConversationInvitationPayload,
    createdAt: Timestamp = Timestamp.now(),
    id: NotificationId = NotificationId.generate(),
  ): Notification {
    const notification = new Notification(
      id,
      NotificationType.CONVERSATION_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
      createdAt,
    );

    return Notification.recordCreated(notification);
  }

  public static groupConversationInvitation(
    payload: ConversationInvitationPayload,
    createdAt: Timestamp = Timestamp.now(),
    id: NotificationId = NotificationId.generate(),
  ): Notification {
    const notification = new Notification(
      id,
      NotificationType.GROUP_CONVERSATION_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
      createdAt,
    );

    return Notification.recordCreated(notification);
  }

  public static missedCall(
    payload: MissedCallPayload,
    createdAt: Timestamp = Timestamp.now(),
    id: NotificationId = NotificationId.generate(),
  ): Notification {
    const notification = new Notification(
      id,
      NotificationType.MISSED_CALL,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
      createdAt,
    );

    return Notification.recordCreated(notification);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Notification>,
  ): Notification {
    return new Notification(
      new NotificationId(primitives.id),
      new NotificationType(primitives.type),
      new IdentityId(primitives.recipientIdentityId),
      new NotificationStatus(primitives.status),
      new NotificationState(primitives.state),
      Notification.payloadFromPrimitives(primitives.payload),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly id: NotificationId,
    private readonly type: NotificationType,
    private readonly recipientIdentityId: IdentityId,
    private status: NotificationStatus,
    private state: NotificationState,
    private payload:
      | CommunityInvitationPayload
      | ConversationInvitationPayload
      | MissedCallPayload,
    private readonly createdAt: Timestamp,
  ) {
    super();
  }

  private recordUpdated(
    EventClass:
      | typeof NotificationWasAcceptedEvent
      | typeof NotificationWasDeclinedEvent,
  ): void {
    const primitives = this.toPrimitives();

    this.record(
      new EventClass(primitives.id, {
        notification: primitives,
        recipientIdentityId: primitives.recipientIdentityId,
      }),
    );
  }

  public accept(): void {
    this.state = NotificationState.ACCEPTED;
    this.status = NotificationStatus.READ;
    this.recordUpdated(NotificationWasAcceptedEvent);
  }

  public decline(): void {
    this.state = NotificationState.DECLINED;
    this.status = NotificationStatus.READ;
    this.recordUpdated(NotificationWasDeclinedEvent);
  }

  public getRecipientIdentityId(): IdentityId {
    return this.recipientIdentityId;
  }

  public isRecipient(identityId: IdentityId): boolean {
    return this.recipientIdentityId.isEqual(identityId);
  }

  public markAsRead(): void {
    this.status = NotificationStatus.READ;
  }

  public markAsUnread(): void {
    this.status = NotificationStatus.UNREAD;
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      id: this.id.valueOf(),
      payload: this.payload.toPrimitives(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
      state: this.state.valueOf(),
      status: this.status.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
