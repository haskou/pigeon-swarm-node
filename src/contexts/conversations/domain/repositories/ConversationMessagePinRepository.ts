import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';
import { ConversationMessagePin } from './types/ConversationMessagePin';

export default abstract class ConversationMessagePinRepository {
  public abstract findByConversation(
    conversationId: ConversationId,
  ): Promise<ConversationMessagePin[]>;

  public abstract pin(
    conversationId: ConversationId,
    messageId: MessageId,
    pinnedByIdentityId: IdentityId,
    createdAt?: Timestamp,
  ): Promise<void>;

  public abstract unpin(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<void>;
}
