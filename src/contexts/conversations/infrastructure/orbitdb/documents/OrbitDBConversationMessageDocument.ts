import { MessageBasePrimitives as Base } from '../../../domain/entities/messages/types/MessageBasePrimitives';
import { MessageTypeValue } from '../../../domain/value-objects/types/MessageTypeValue';

export interface OrbitDBConversationMessageDocument extends Base {
  encryptedPayload?: string;
  lastEventId?: string;
  lastEventType?: string;
  messageId: string;
  networkId?: string;
  pollId?: string;
  receivedAt?: number;
  recipientIds?: string[];
  scopeType: 'conversation';
  targetMessageId?: string;
  type: MessageTypeValue;
  valid?: boolean;
}
