import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { EncryptedConversationKey } from '@app/contexts/notifications/domain/value-objects/EncryptedConversationKey';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { NotificationState } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatus } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';
import { NotificationType } from '@app/contexts/notifications/domain/value-objects/NotificationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { IdentityMother } from './IdentityMother';

export class NotificationMother {
  public createdAt: Timestamp = new Timestamp(1773848829055);
  public id: NotificationId = NotificationId.generate();
  public inviterIdentityId: IdentityId = new IdentityMother().id;
  public recipientIdentityId: IdentityId = new IdentityId(
    'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
  );
  public state: NotificationState = NotificationState.PENDING;
  public status: NotificationStatus = NotificationStatus.UNREAD;

  public withRecipientIdentityId(recipientIdentityId: IdentityId): this {
    this.recipientIdentityId = recipientIdentityId;

    return this;
  }

  public build(): Notification {
    return new Notification(
      this.id,
      NotificationType.CONVERSATION_INVITATION,
      this.recipientIdentityId,
      this.status,
      this.state,
      new ConversationInvitationPayload(
        new ConversationId('one-to-one:notification-test'),
        this.inviterIdentityId,
        this.recipientIdentityId,
        new EncryptedConversationKey('encrypted-conversation-key'),
        new Signature(
          'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
        ),
        undefined,
      ),
      this.createdAt,
    );
  }
}
