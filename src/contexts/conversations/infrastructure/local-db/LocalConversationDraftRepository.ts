import { ConversationDraftKey } from '@app/contexts/conversations/domain/value-objects/ConversationDraftKey';
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
    draftKey: ConversationDraftKey,
  ): string {
    return `${identityId.valueOf()}:${draftKey.valueOf()}`;
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalConversationDraftDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.draftKey === 'string' &&
      typeof document.encryptedPayload === 'string' &&
      typeof document.identityId === 'string' &&
      typeof document.updatedAt === 'number'
    );
  }

  private toDraft(document: LocalConversationDraftDocument): ConversationDraft {
    return new ConversationDraft(
      new ConversationDraftKey(document.draftKey),
      new EncryptedMessagePayload(document.encryptedPayload),
      new Timestamp(document.updatedAt),
    );
  }

  public async save(
    identityId: IdentityId,
    draftKey: ConversationDraftKey,
    encryptedPayload: EncryptedMessagePayload,
    updatedAt: Timestamp,
  ): Promise<void> {
    const document: LocalConversationDraftDocument = {
      _id: this.draftId(identityId, draftKey),
      draftKey: draftKey.valueOf(),
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
    draftKey: ConversationDraftKey,
  ): Promise<void> {
    await this.database.delete(
      LocalConversationDraftRepository.NAMESPACE,
      this.draftId(identityId, draftKey),
    );
  }

  public async deleteUnkeyed(): Promise<void> {
    await this.database.deleteMany(
      LocalConversationDraftRepository.NAMESPACE,
      (document) => typeof document.draftKey !== 'string',
    );
  }

  public async exists(
    identityId: IdentityId,
    draftKey: ConversationDraftKey,
  ): Promise<boolean> {
    const document = await this.database.findOne(
      LocalConversationDraftRepository.NAMESPACE,
      this.draftId(identityId, draftKey),
    );

    return document !== undefined;
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
