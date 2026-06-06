import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PushNotificationPayload } from '../PushNotificationPayload';
import { PushNotificationScope } from './PushNotificationScope';

export type PushNotificationIntent = {
  mentionsEveryoneOrHere: boolean;
  mentionsRecipientIdentityIds: IdentityId[];
  mentionsRoleIdentityIds: IdentityId[];
  payload: PushNotificationPayload;
  respectBusy: boolean;
  respectPreferences: boolean;
  recipientIdentityIds: IdentityId[];
  scope: PushNotificationScope;
  unreadMessage?: {
    conversationId: ConversationId;
    messageId: MessageId;
  };
};
