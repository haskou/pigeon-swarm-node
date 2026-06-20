import { ConversationDraft } from '../../domain/ConversationDraft';
import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraftsFindMessage } from './messages/ConversationDraftsFindMessage';

export default class ConversationDraftsFinder {
  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public find(
    message: ConversationDraftsFindMessage,
  ): Promise<ConversationDraft[]> {
    return this.draftRepository.findByIdentity(message.identityId);
  }
}
