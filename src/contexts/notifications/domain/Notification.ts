import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityInvitationPayload } from './CommunityInvitationPayload';
import { ConversationInvitationPayload } from './ConversationInvitationPayload';
import { NotificationWasAcceptedEvent } from './events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from './events/NotificationWasCreatedEvent';
import { NotificationWasDeclinedEvent } from './events/NotificationWasDeclinedEvent';
import { NotificationAlreadyResolvedError } from './errors/NotificationAlreadyResolvedError';
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
  ): Notification {
    const notification = new Notification(
      payload.notificationId(),
      NotificationType.COMMUNITY_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
    );

    return Notification.recordCreated(notification);
  }

  public static conversationInvitation(
    payload: ConversationInvitationPayload,
  ): Notification {
    const notification = new Notification(
      payload.notificationId(),
      NotificationType.CONVERSATION_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
    );

    return Notification.recordCreated(notification);
  }

  public static groupConversationInvitation(
    payload: ConversationInvitationPayload,
  ): Notification {
    const notification = new Notification(
      payload.notificationId(),
      NotificationType.GROUP_CONVERSATION_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
    );

    return Notification.recordCreated(notification);
  }

  public static missedCall(payload: MissedCallPayload): Notification {
    const notification = new Notification(
      payload.notificationId(),
      NotificationType.MISSED_CALL,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
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
  ) {
    super();
  }

  private recordUpdated(
    EventClass:
      typeof NotificationWasAcceptedEvent | typeof NotificationWasDeclinedEvent,
  ): void {
    const primitives = this.toPrimitives();

    this.record(
      new EventClass(primitives.id, {
        notification: primitives,
        recipientIdentityId: primitives.recipientIdentityId,
      }),
    );
  }

  private assertPending(): void {
    if (!this.state.isEqual(NotificationState.PENDING)) {
      throw new NotificationAlreadyResolvedError();
    }
  }

  public accept(): void {
    this.assertPending();
    this.state = NotificationState.ACCEPTED;
    this.status = NotificationStatus.READ;
    this.recordUpdated(NotificationWasAcceptedEvent);
  }

  public decline(): void {
    this.assertPending();
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

  public getId(): NotificationId {
    return this.id;
  }

  public markAsRead(): void {
    this.status = NotificationStatus.READ;
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      payload: this.payload.toPrimitives(),
      recipientIdentityId: this.recipientIdentityId.valueOf(),
      state: this.state.valueOf(),
      status: this.status.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
