import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraftSaveMessage } from './messages/ConversationDraftSaveMessage';

/**
 * Drafts are owner-only and keyed opaquely, so no conversation gate bounds
 * them: each identity keeps its most recently updated drafts up to a limit.
 * Only a new key can grow the set, so only a new key pays for eviction, and
 * the draft just written is never the one evicted.
 */
export default class ConversationDraftSaver {
  public static readonly MAX_DRAFTS_PER_IDENTITY = 100;

  constructor(private readonly draftRepository: ConversationDraftRepository) {}

  public async save(message: ConversationDraftSaveMessage): Promise<void> {
    const isNewKey = !(await this.draftRepository.exists(
      message.identityId,
      message.draftKey,
    ));

    await this.draftRepository.save(
      message.identityId,
      message.draftKey,
      message.encryptedPayload,
      message.updatedAt,
    );

    if (!isNewKey) {
      return;
    }

    const others = (
      await this.draftRepository.findByIdentity(message.identityId)
    ).filter((draft) => !draft.getDraftKey().isEqual(message.draftKey));

    await Promise.all(
      others
        .slice(ConversationDraftSaver.MAX_DRAFTS_PER_IDENTITY - 1)
        .map((draft) =>
          this.draftRepository.delete(message.identityId, draft.getDraftKey()),
        ),
    );
  }
}
