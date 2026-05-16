import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';
import { MessageReactionRepository } from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoMessageReactionDocument } from './documents/MongoMessageReactionDocument';
import MongoMessageReactionMapper from './mappers/MongoMessageReactionMapper';

type Repository = MessageReactionRepository;

export default class MongoMessageReactionRepository implements Repository {
  private static readonly COLLECTION = 'conversation_message_reactions';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoMessageReactionMapper,
  ) {}

  private async collection() {
    return this.mongo.getCollection<MongoMessageReactionDocument>(
      MongoMessageReactionRepository.COLLECTION,
    );
  }

  public async save(reaction: MessageReaction): Promise<void> {
    const document = this.mapper.toDocument(reaction);

    await (
      await this.collection()
    ).updateOne(
      { _id: document._id },
      { $setOnInsert: document },
      { upsert: true },
    );
  }

  public async delete(reaction: MessageReaction): Promise<void> {
    const document = this.mapper.toDocument(reaction);

    await (await this.collection()).deleteOne({ _id: document._id });
  }

  public async findByMessageIds(
    conversationId: ConversationId,
    messageIds: MessageId[],
  ): Promise<MessageReaction[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const documents = await (
      await this.collection()
    )
      .find({
        conversationId: conversationId.valueOf(),
        messageId: {
          $in: messageIds.map((messageId) => messageId.valueOf()),
        },
      })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async findCandidates(
    conversationId: ConversationId,
  ): Promise<MessageReaction[]> {
    const documents = await (await this.collection())
      .find({ conversationId: conversationId.valueOf() })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map((document) => this.mapper.toDomain(document));
  }
}
