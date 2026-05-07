import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Conversation } from '../Conversation';
import { Message } from '../Message';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageEventId } from '../value-objects/MessageEventId';

export interface ConversationRepository {
  findById(conversationId: ConversationId): Promise<Conversation | undefined>;
  findEventById(
    conversationId: ConversationId,
    eventId: MessageEventId,
  ): Promise<Message | undefined>;
  findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
  ): Promise<Conversation | undefined>;
  save(conversation: Conversation): Promise<void>;
}
