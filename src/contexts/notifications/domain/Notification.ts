import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { ConversationInvitationPayload } from './ConversationInvitationPayload';
import { NotificationId } from './value-objects/NotificationId';
import { NotificationState } from './value-objects/NotificationState';
import { NotificationStatus } from './value-objects/NotificationStatus';
import { NotificationType } from './value-objects/NotificationType';

export class Notification extends AggregateRoot {
  public static conversationInvitation(
    payload: ConversationInvitationPayload,
    createdAt: Timestamp = Timestamp.now(),
    id: NotificationId = NotificationId.generate(),
  ): Notification {
    return new Notification(
      id,
      NotificationType.CONVERSATION_INVITATION,
      payload.getRecipientIdentityId(),
      NotificationStatus.UNREAD,
      NotificationState.PENDING,
      payload,
      createdAt,
      undefined,
    );
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
      ConversationInvitationPayload.fromPrimitives(primitives.payload),
      new Timestamp(primitives.createdAt),
      primitives.archivedAt ? new Timestamp(primitives.archivedAt) : undefined,
    );
  }

  constructor(
    private readonly id: NotificationId,
    private readonly type: NotificationType,
    private readonly recipientIdentityId: IdentityId,
    private status: NotificationStatus,
    private state: NotificationState,
    private payload: ConversationInvitationPayload,
    private readonly createdAt: Timestamp,
    private archivedAt: Timestamp | undefined,
  ) {
    super();
  }

  public accept(keychainExternalIdentifier: string): void {
    this.state = NotificationState.ACCEPTED;
    this.status = NotificationStatus.READ;
    this.payload = this.payload.accept(
      new KeychainExternalIdentifier(keychainExternalIdentifier),
    );
  }

  public archive(archivedAt: Timestamp = Timestamp.now()): void {
    this.archivedAt = archivedAt;
  }

  public decline(): void {
    this.state = NotificationState.DECLINED;
    this.status = NotificationStatus.READ;
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
      archivedAt: this.archivedAt?.valueOf(),
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
