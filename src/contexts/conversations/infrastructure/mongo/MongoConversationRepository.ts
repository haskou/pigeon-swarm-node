import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { ConversationRepository as Repository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoConversationDocument } from './documents/MongoConversationDocument';
import MongoConversationMapper from './mappers/MongoConversationMapper';

export default class MongoConversationRepository implements Repository {
  private static readonly COLLECTION = 'conversations';
  private readonly mapper: MongoConversationMapper;

  constructor(
    private readonly mongo: MongoDB,
    mapper?: MongoConversationMapper,
  ) {
    this.mapper = mapper || new MongoConversationMapper();
  }

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

  public async findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    const conversation = await this.findById(conversationId);

    return conversation?.findMessageById(messageId);
  }

  public async findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
  ): Promise<Conversation | undefined> {
    const conversationId = ConversationId.deterministic(
      firstIdentityId,
      secondIdentityId,
    );

    return this.findById(conversationId);
  }

  public async save(conversation: Conversation): Promise<void> {
    const document = this.mapper.toDocument(conversation);

    await (
      await this.collection()
    ).updateOne(
      { _id: document._id },
      {
        $set: {
          participantIds: document.participantIds,
          type: document.type,
          updatedAt: document.updatedAt,
        },
        $setOnInsert: {
          createdAt: document.createdAt,
        },
      },
      { upsert: true },
    );
  }
}
