import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import {
  ConversationMessageCandidate,
  ConversationRepository,
} from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { IpfsMessageDocument } from '../ipfs/documents/IpfsMessageDocument';
import IpfsMessageMapper from '../ipfs/mappers/IpfsMessageMapper';
import { MongoConversationDocument } from './documents/MongoConversationDocument';
import { MongoMessageMetadataDocument } from './documents/MongoMessageMetadataDocument';
import MongoConversationMapper from './mappers/MongoConversationMapper';
import MongoMessageMetadataMapper from './mappers/MongoMessageMetadataMapper';

type Repository = ConversationRepository;

export default class MongoConversationRepository implements Repository {
  private static readonly COLLECTION = 'conversations';
  private static readonly MESSAGES_COLLECTION = 'conversation_messages';
  private static readonly MESSAGE_ROUTING_KEY_PREFIX =
    'pigeon-swarm_conversation-message-';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoConversationMapper,
    private readonly ipfsManager: IPFS,
    private readonly messageMapper: IpfsMessageMapper,
    private readonly metadataMapper: MongoMessageMetadataMapper,
  ) {}

  private async collection() {
    return this.mongo.getCollection<MongoConversationDocument>(
      MongoConversationRepository.COLLECTION,
    );
  }

  private async messageMetadataCollection() {
    return this.mongo.getCollection<MongoMessageMetadataDocument>(
      MongoConversationRepository.MESSAGES_COLLECTION,
    );
  }

  private async findMessagesByConversationId(
    conversationId: ConversationId,
  ): Promise<Message[]> {
    const documents = await (
      await this.messageMetadataCollection()
    )
      .find({
        conversationId: conversationId.valueOf(),
        valid: true,
      })
      .sort({ createdAt: 1 })
      .toArray();

    const messages: Message[] = [];

    for (const document of documents) {
      const message = await this.findMessageFromMetadata(document);

      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  private async findMessageFromMetadata(
    metadata: MongoMessageMetadataDocument,
  ): Promise<Message | undefined> {
    try {
      const document = await this.ipfsManager.getJSON<IpfsMessageDocument>(
        new IPFSId(metadata.cid),
      );

      return this.messageMapper.toDomain(document);
    } catch {
      return undefined;
    }
  }

  private getMessageRoutingKey(
    conversationId: ConversationId,
    messageId: MessageId,
  ): string {
    return `${MongoConversationRepository.MESSAGE_ROUTING_KEY_PREFIX}${conversationId.valueOf()}-${messageId.valueOf()}`;
  }

  private async findMessageFromCid(cid: IPFSId): Promise<Message | undefined> {
    try {
      const document = await this.ipfsManager.getJSON<IpfsMessageDocument>(cid);

      return this.messageMapper.toDomain(document);
    } catch {
      return undefined;
    }
  }

  private getRecipientIds(
    conversation: Conversation,
    message: Message,
  ): string[] {
    return conversation
      .toPrimitives()
      .participantIds.filter(
        (participantId) => participantId !== message.getAuthorId().valueOf(),
      );
  }

  private async deleteTargetMessageContent(message: Message): Promise<void> {
    const targetMessageId = message.getTargetMessageId();

    if (!targetMessageId) {
      return;
    }

    const metadata = await (
      await this.messageMetadataCollection()
    ).findOne({
      conversationId: message.toPrimitives().conversationId,
      messageId: targetMessageId.valueOf(),
      valid: true,
    });

    if (!metadata) {
      return;
    }

    await this.ipfsManager.removeJSONFromAll(new IPFSId(metadata.cid));
    await (
      await this.messageMetadataCollection()
    ).updateOne({ _id: metadata._id }, { $set: { valid: false } });
  }

  public async findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: conversationId.valueOf(),
    });

    if (!document) {
      return undefined;
    }

    return this.mapper.toDomain(
      document,
      await this.findMessagesByConversationId(conversationId),
    );
  }

  public async findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]> {
    const collection = await this.collection();
    const beforeDocument = beforeConversationId
      ? await collection.findOne({ _id: beforeConversationId.valueOf() })
      : undefined;
    const documents = await collection
      .find({
        ...(beforeDocument
          ? { createdAt: { $lt: beforeDocument.createdAt } }
          : {}),
        participantIds: participantId.valueOf(),
      })
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();
    const conversations: Conversation[] = [];

    for (const document of documents) {
      conversations.push(
        this.mapper.toDomain(
          document,
          await this.findMessagesByConversationId(
            new ConversationId(document._id),
          ),
        ),
      );
    }

    return conversations;
  }

  public async findLatestMessages(
    conversationId: ConversationId,
    limit: number,
    beforeMessageId?: MessageId,
  ): Promise<Message[]> {
    const collection = await this.messageMetadataCollection();
    const beforeDocument = beforeMessageId
      ? await collection.findOne({
          conversationId: conversationId.valueOf(),
          messageId: beforeMessageId.valueOf(),
          valid: true,
        })
      : undefined;
    const documents = await collection
      .find({
        ...(beforeDocument
          ? { createdAt: { $lt: beforeDocument.createdAt } }
          : {}),
        conversationId: conversationId.valueOf(),
        valid: true,
      })
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();
    const messages: Message[] = [];

    for (const document of documents.reverse()) {
      const message = await this.findMessageFromMetadata(document);

      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  public async findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    const metadata = await (
      await this.messageMetadataCollection()
    ).findOne({
      conversationId: conversationId.valueOf(),
      messageId: messageId.valueOf(),
      valid: true,
    });

    return metadata ? this.findMessageFromMetadata(metadata) : undefined;
  }

  public async findMessageCandidates(
    conversationId: ConversationId,
    limit: number,
  ): Promise<ConversationMessageCandidate[]> {
    const documents = await (
      await this.messageMetadataCollection()
    )
      .find({
        conversationId: conversationId.valueOf(),
        valid: true,
      })
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();

    return documents.reverse().map((document) => ({
      authorIdentityId: document.authorId,
      createdAt: document.createdAt,
      messageId: document.messageId,
      messageType: document.type,
    }));
  }

  public async findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    const localMessage = await this.findMessageById(conversationId, messageId);

    if (localMessage) {
      return localMessage;
    }

    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.getMessageRoutingKey(conversationId, messageId),
    );

    for (const cidString of cidStrings) {
      const message = await this.findMessageFromCid(new IPFSId(cidString));

      if (message) {
        return message;
      }
    }

    return undefined;
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

    for (const message of conversation.toPrimitives().messages) {
      const existing = await this.findMessageById(
        new ConversationId(message.conversationId),
        new MessageId(message.id),
      );

      if (existing) {
        continue;
      }

      const domainMessage = conversation.findMessageById(
        new MessageId(message.id),
      );

      if (!domainMessage) {
        continue;
      }

      const cid = await this.ipfsManager.addJSONToAll(
        this.messageMapper.toDocument(domainMessage),
      );
      const metadata = this.metadataMapper.toDocument(
        domainMessage,
        cid,
        this.getRecipientIds(conversation, domainMessage),
      );

      await (
        await this.messageMetadataCollection()
      ).updateOne(
        { _id: metadata._id },
        { $setOnInsert: metadata },
        { upsert: true },
      );
      await this.ipfsManager.putRecordToAll(
        this.getMessageRoutingKey(
          new ConversationId(message.conversationId),
          new MessageId(message.id),
        ),
        cid.valueOf(),
      );
      await this.deleteTargetMessageContent(domainMessage);
    }
  }
}
