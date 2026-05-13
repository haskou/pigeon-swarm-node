import { NotificationStateValue } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatusValue } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';
import { NotificationTypeValue } from '@app/contexts/notifications/domain/value-objects/NotificationType';

export type MongoConversationInvitationPayloadDocument = {
  conversationId: string;
  encryptedConversationKey: string;
  inviterIdentityId: string;
  inviterSignature: string;
  recipientIdentityId: string;
};
export type MongoCommunityInvitationPayloadDocument = {
  communityId: string;
  encryptedCommunityKey: string;
  inviterIdentityId: string;
  inviterSignature: string;
  recipientIdentityId: string;
};

export type MongoNotificationDocument = {
  _id: string;
  createdAt: number;
  payload:
    | MongoCommunityInvitationPayloadDocument
    | MongoConversationInvitationPayloadDocument;
  recipientIdentityId: string;
  state: NotificationStateValue;
  status: NotificationStatusValue;
  type: NotificationTypeValue;
};
