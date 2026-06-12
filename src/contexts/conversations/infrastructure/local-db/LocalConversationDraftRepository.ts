import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Timestamp } from '@haskou/value-objects';

import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { ConversationDraft } from '../../domain/repositories/types/ConversationDraft';
import { LocalConversationDraftDocument } from './documents/LocalConversationDraftDocument';

// eslint-disable-next-line max-len
export default class LocalConversationDraftRepository extends ConversationDraftRepository {
  private static readonly NAMESPACE = 'conversation_drafts';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private draftId(
    identityId: IdentityId,
    conversationId: ConversationId,
  ): string {
    return `${identityId.valueOf()}:${conversationId.valueOf()}`;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalConversationDraftDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.conversationId === 'string' &&
      typeof document.encryptedPayload === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.updatedAt === 'number'
    );
  }

  private toDraft(document: LocalConversationDraftDocument): ConversationDraft {
    return {
      conversationId: document.conversationId,
      encryptedPayload: document.encryptedPayload,
      updatedAt: document.updatedAt,
    };
  }

  public async save(
    identityId: IdentityId,
    conversationId: ConversationId,
    encryptedPayload: string,
    updatedAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: LocalConversationDraftDocument = {
      _id: this.draftId(identityId, conversationId),
      conversationId: conversationId.valueOf(),
      encryptedPayload,
      identityId: identityId.valueOf(),
      updatedAt: updatedAt.valueOf(),
    };

    await this.database.save(
      LocalConversationDraftRepository.NAMESPACE,
      document._id,
      document,
    );
  }

  public async delete(
    identityId: IdentityId,
    conversationId: ConversationId,
  ): Promise<void> {
    await this.database.delete(
      LocalConversationDraftRepository.NAMESPACE,
      this.draftId(identityId, conversationId),
    );
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<ConversationDraft[]> {
    const documents = await this.database.find(
      LocalConversationDraftRepository.NAMESPACE,
      (document) => document.identityId === identityId.valueOf(),
    );

    return documents
      .filter((document): document is LocalConversationDraftDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((document) => this.toDraft(document));
  }
}
