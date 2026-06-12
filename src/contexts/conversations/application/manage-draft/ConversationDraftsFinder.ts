import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraft } from '../../domain/repositories/types/ConversationDraft';
import { ConversationDraftsFindMessage } from './messages/ConversationDraftsFindMessage';

export default class ConversationDraftsFinder {
  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public find(
    message: ConversationDraftsFindMessage,
  ): Promise<ConversationDraft[]> {
    return this.draftRepository.findByIdentity(message.identityId);
  }
}
