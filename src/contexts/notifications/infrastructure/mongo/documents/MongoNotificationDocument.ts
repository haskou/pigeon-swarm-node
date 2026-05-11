import { NotificationStateValue } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatusValue } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';
import { NotificationTypeValue } from '@app/contexts/notifications/domain/value-objects/NotificationType';

export type MongoConversationInvitationPayloadDocument = {
  conversationId: string;
  encryptedConversationKey: string;
  inviterIdentityId: string;
  keyEncryptionAlgorithm?: string;
  keychainExternalIdentifier?: string;
  recipientIdentityId: string;
  signature: string;
};

export type MongoNotificationDocument = {
  _id: string;
  archivedAt?: number;
  createdAt: number;
  payload: MongoConversationInvitationPayloadDocument;
  recipientIdentityId: string;
  state: NotificationStateValue;
  status: NotificationStatusValue;
  type: NotificationTypeValue;
};
