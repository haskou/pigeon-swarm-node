import { NotificationStateValue } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatusValue } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';
import { NotificationTypeValue } from '@app/contexts/notifications/domain/value-objects/NotificationType';

import { MongoCommunityInvitationPayloadDocument } from './MongoCommunityInvitationPayloadDocument';
import { MongoConversationInvitationPayloadDocument } from './MongoConversationInvitationPayloadDocument';
import { MongoMissedCallPayloadDocument } from './MongoMissedCallPayloadDocument';

export type MongoNotificationDocument = {
  _id: string;
  createdAt: number;
  payload:
    | MongoCommunityInvitationPayloadDocument
    | MongoConversationInvitationPayloadDocument
    | MongoMissedCallPayloadDocument;
  recipientIdentityId: string;
  state: NotificationStateValue;
  status: NotificationStatusValue;
  type: NotificationTypeValue;
};
