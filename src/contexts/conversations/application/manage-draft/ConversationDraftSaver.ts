import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraftSaveMessage } from './messages/ConversationDraftSaveMessage';

/**
 * Drafts are owner-only and keyed opaquely, so no conversation gate bounds
 * them: each identity keeps its most recently updated drafts up to a limit.
 */
export default class ConversationDraftSaver {
  public static readonly MAX_DRAFTS_PER_IDENTITY = 100;

  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public async save(message: ConversationDraftSaveMessage): Promise<void> {
    await this.draftRepository.save(
      message.identityId,
      message.draftKey,
      message.encryptedPayload,
      message.updatedAt,
    );

    const drafts = await this.draftRepository.findByIdentity(
      message.identityId,
    );

    await Promise.all(
      drafts
        .slice(ConversationDraftSaver.MAX_DRAFTS_PER_IDENTITY)
        .map((draft) =>
          this.draftRepository.delete(message.identityId, draft.getDraftKey()),
        ),
    );
  }
}
