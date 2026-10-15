import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraftDeleteMessage } from './messages/ConversationDraftDeleteMessage';

export default class ConversationDraftDeleter {
  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public async delete(message: ConversationDraftDeleteMessage): Promise<void> {
    await this.draftRepository.delete(message.identityId, message.draftKey);
  }
}
