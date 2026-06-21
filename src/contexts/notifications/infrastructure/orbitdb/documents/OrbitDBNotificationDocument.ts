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
  state: string;
  status: string;
  type: string;
};
