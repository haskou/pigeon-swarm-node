import { NotificationStateValue } from '@app/contexts/notifications/domain/value-objects/NotificationState';
import { NotificationStatusValue } from '@app/contexts/notifications/domain/value-objects/NotificationStatus';
import { NotificationTypeValue } from '@app/contexts/notifications/domain/value-objects/NotificationType';

import { OrbitDBCommunityInvitationPayloadDocument } from './OrbitDBCommunityInvitationPayloadDocument';
import { OrbitDBConversationInvitationPayloadDocument } from './OrbitDBConversationInvitationPayloadDocument';
import { OrbitDBMissedCallPayloadDocument } from './OrbitDBMissedCallPayloadDocument';

export type OrbitDBNotificationDocument = {
  createdAt: number;
  id: string;
  payload:
    | OrbitDBCommunityInvitationPayloadDocument
    | OrbitDBConversationInvitationPayloadDocument
    | OrbitDBMissedCallPayloadDocument;
  recipientIdentityId: string;
  state: NotificationStateValue;
  status: NotificationStatusValue;
  type: NotificationTypeValue;
};
