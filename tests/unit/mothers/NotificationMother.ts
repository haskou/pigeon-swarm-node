import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { EncryptedConversationKey } from '@app/contexts/notifications/domain/value-objects/EncryptedConversationKey';
import { InvitationNonce } from '@app/contexts/notifications/domain/value-objects/InvitationNonce';
import { NotificationState } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatus } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';
import { NotificationType } from '@app/contexts/notifications/domain/value-objects/NotificationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { IdentityMother } from './IdentityMother';

export class NotificationMother {
  public inviterIdentityId: IdentityId = new IdentityMother().id;
  public nonce = 'notification-test-nonce-0001';
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
    const payload = new ConversationInvitationPayload(
      new ConversationId('one-to-one:notification-test'),
      this.inviterIdentityId,
      this.recipientIdentityId,
      new EncryptedConversationKey('encrypted-conversation-key'),
      new InvitationNonce(this.nonce),
    );

    return new Notification(
      payload.notificationId(),
      NotificationType.CONVERSATION_INVITATION,
      this.recipientIdentityId,
      this.status,
      this.state,
      payload,
    );
  }
}
