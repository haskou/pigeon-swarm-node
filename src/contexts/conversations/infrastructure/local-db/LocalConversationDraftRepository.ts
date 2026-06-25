import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Timestamp } from '@haskou/value-objects';

import { ConversationDraft } from '../../domain/ConversationDraft';
import ConversationDraftRepository from '../../domain/repositories/ConversationDraftRepository';
import { LocalConversationDraftDocument } from './documents/LocalConversationDraftDocument';

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
    return new ConversationDraft(
      new ConversationId(document.conversationId),
      new EncryptedMessagePayload(document.encryptedPayload),
      new Timestamp(document.updatedAt),
    );
  }

  public async save(
    identityId: IdentityId,
    conversationId: ConversationId,
    encryptedPayload: EncryptedMessagePayload,
    updatedAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: LocalConversationDraftDocument = {
      _id: this.draftId(identityId, conversationId),
      conversationId: conversationId.valueOf(),
      encryptedPayload: encryptedPayload.valueOf(),
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
