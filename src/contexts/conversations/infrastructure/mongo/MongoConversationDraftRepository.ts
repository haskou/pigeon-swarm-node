import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Timestamp } from '@haskou/value-objects';

import { MongoConversationDraftDocument } from './documents/MongoConversationDraftDocument';

export class MongoConversationDraftRepository {
  private static readonly COLLECTION = 'conversation_drafts';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoConversationDraftDocument>(
      MongoConversationDraftRepository.COLLECTION,
    );
  }

  private draftId(
    identityId: IdentityId,
    conversationId: ConversationId,
  ): string {
    return `${identityId.valueOf()}:${conversationId.valueOf()}`;
  }

  public async save(
    identityId: IdentityId,
    conversationId: ConversationId,
    encryptedPayload: string,
    updatedAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: MongoConversationDraftDocument = {
      _id: this.draftId(identityId, conversationId),
      conversationId: conversationId.valueOf(),
      encryptedPayload,
      identityId: identityId.valueOf(),
      updatedAt: updatedAt.valueOf(),
    };

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }

  public async delete(
    identityId: IdentityId,
    conversationId: ConversationId,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({ _id: this.draftId(identityId, conversationId) });
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<MongoConversationDraftDocument[]> {
    return (await this.collection())
      .find({ identityId: identityId.valueOf() })
      .sort({ updatedAt: -1 })
      .toArray();
  }
}
