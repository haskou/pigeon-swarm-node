import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';

/**
 * Drafts stored before opaque keys name their conversation in clear and no
 * route can reach them any more, so the node deletes them.
 */
export default class UnkeyedConversationDraftsPurger {
  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public purge(): Promise<void> {
    return this.draftRepository.deleteUnkeyed();
  }
}
