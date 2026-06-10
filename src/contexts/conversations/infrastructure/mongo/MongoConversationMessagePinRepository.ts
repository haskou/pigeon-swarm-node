import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Timestamp } from '@haskou/value-objects';

import ConversationMessagePinRepository from '../../domain/repositories/ConversationMessagePinRepository';
import { MongoConversationMessagePinDocument } from './documents/MongoConversationMessagePinDocument';

// eslint-disable-next-line max-len
export default class MongoConversationMessagePinRepository extends ConversationMessagePinRepository {
  private static readonly COLLECTION = 'conversation_message_pins';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoConversationMessagePinDocument>(
      MongoConversationMessagePinRepository.COLLECTION,
    );
  }

  private pinId(conversationId: ConversationId, messageId: MessageId): string {
    return `${conversationId.valueOf()}:${messageId.valueOf()}`;
  }

  public async pin(
    conversationId: ConversationId,
    messageId: MessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document: MongoConversationMessagePinDocument = {
      _id: this.pinId(conversationId, messageId),
      conversationId: conversationId.valueOf(),
      createdAt: createdAt.valueOf(),
      messageId: messageId.valueOf(),
      pinnedByIdentityId: pinnedByIdentityId.valueOf(),
    };

    await (
      await this.collection()
    ).updateOne(
      { _id: document._id },
      { $setOnInsert: document },
      { upsert: true },
    );
  }

  public async unpin(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<void> {
    await (
      await this.collection()
    ).deleteOne({ _id: this.pinId(conversationId, messageId) });
  }

  public async findByConversation(
    conversationId: ConversationId,
  ): Promise<MongoConversationMessagePinDocument[]> {
    return (await this.collection())
      .find({ conversationId: conversationId.valueOf() })
      .sort({ createdAt: -1 })
      .toArray();
  }
}
