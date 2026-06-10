import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import ConversationDraftAccess from './ConversationDraftAccess';
import { ConversationDraftDeleteMessage } from './messages/ConversationDraftDeleteMessage';

export default class ConversationDraftDeleter {
  constructor(
    private readonly draftRepository: ConversationDraftRepository,
    private readonly access: ConversationDraftAccess,
  ) {}

  public async delete(message: ConversationDraftDeleteMessage): Promise<void> {
    await this.access.assertCanRead(message.conversationId, message.identityId);
    await this.draftRepository.delete(
      message.identityId,
      message.conversationId,
    );
  }
}
