import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoConversationDocument } from './documents/MongoConversationDocument';
import MongoConversationMapper from './mappers/MongoConversationMapper';

type Repository = ConversationRepository;

export default class MongoConversationRepository implements Repository {
  private static readonly COLLECTION = 'conversations';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoConversationMapper,
  ) {}

  private async collection() {
    return this.mongo.getCollection<MongoConversationDocument>(
      MongoConversationRepository.COLLECTION,
    );
  }

  public async findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: conversationId.valueOf(),
    });

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    void conversationId;
    void messageId;

    return Promise.resolve<Message | undefined>(undefined);
  }

  public async findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
  ): Promise<Conversation | undefined> {
    return this.findById(
      ConversationId.deterministic(firstIdentityId, secondIdentityId),
    );
  }

  public async save(conversation: Conversation): Promise<void> {
    const document = this.mapper.toDocument(conversation);

    const collection = await this.collection();

    await collection.updateOne(
      { _id: document._id },
      { $setOnInsert: document },
      { upsert: true },
    );
  }
}
