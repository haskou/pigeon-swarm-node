import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { ConversationRepository as Repository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationMessageCandidate } from '@app/contexts/conversations/domain/repositories/types/ConversationMessageCandidate';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/repositories/types/ConversationMessagesAround';
import { ConversationSyncScope } from '@app/contexts/conversations/domain/repositories/types/ConversationSyncScope';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { IpfsMessageDocument } from '../ipfs/documents/IpfsMessageDocument';
import IpfsMessageMapper from '../ipfs/mappers/IpfsMessageMapper';
import { MongoConversationDocument } from './documents/MongoConversationDocument';
import { MongoMessageMetadataDocument } from './documents/MongoMessageMetadataDocument';
import { MongoUnreadConversationMessageDocument } from './documents/MongoUnreadConversationMessageDocument';
import MongoConversationMapper from './mappers/MongoConversationMapper';
import MongoMessageMetadataMapper from './mappers/MongoMessageMetadataMapper';
import { UnreadCount } from './types/UnreadCount';

export default class MongoConversationRepository implements Repository {
  private static readonly COLLECTION = 'conversations';
  private static readonly MESSAGES_COLLECTION = 'conversation_messages';
  private static readonly UNREAD_COLLECTION = 'conversation_unread_messages';
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

  private async unreadCollection() {
    return this.mongo.getCollection<MongoUnreadConversationMessageDocument>(
      MongoConversationRepository.UNREAD_COLLECTION,
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

  private async removeUnreadForMessage(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<void> {
    await (
      await this.unreadCollection()
    ).deleteMany({
      conversationId: conversationId.valueOf(),
      messageId: messageId.valueOf(),
    });
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

  public async findMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: conversationId.valueOf(),
    });

    return document ? this.mapper.toDomain(document) : undefined;
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
      conversations.push(this.mapper.toDomain(document));
    }

    return conversations;
  }

  public async findByNetworkId(
    networkId: NetworkId,
    limit: number,
  ): Promise<Conversation[]> {
    const documents = await (await this.collection())
      .find({ networkId: networkId.valueOf() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => this.mapper.toDomain(document));
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

  public async hasMessage(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean> {
    const metadata = await (
      await this.messageMetadataCollection()
    ).findOne(
      {
        conversationId: conversationId.valueOf(),
        messageId: messageId.valueOf(),
        valid: true,
      },
      {
        projection: { _id: 1 },
      },
    );

    return metadata !== null;
  }

  public async countUnreadByRecipient(
    recipientIdentityId: IdentityId,
    conversationIds: ConversationId[],
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const counts = await (
      await this.unreadCollection()
    )
      .aggregate<UnreadCount>([
        {
          $match: {
            conversationId: {
              $in: conversationIds.map((conversationId) =>
                conversationId.valueOf(),
              ),
            },
            recipientIdentityId: recipientIdentityId.valueOf(),
          },
        },
        {
          $group: {
            _id: '$conversationId',
            unreadCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            conversationId: '$_id',
            unreadCount: 1,
          },
        },
      ])
      .toArray();

    return new Map(
      counts.map((count) => [count.conversationId, count.unreadCount]),
    );
  }

  public async hasUnreadMessageForRecipient(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean> {
    const document = await (
      await this.unreadCollection()
    ).findOne(
      {
        _id: `${conversationId.valueOf()}:${recipientIdentityId.valueOf()}:${messageId.valueOf()}`,
      },
      {
        projection: { _id: 1 },
      },
    );

    return document !== null;
  }

  public async findMessagesAround(
    conversationId: ConversationId,
    messageId: MessageId,
    before: number,
    after: number,
  ): Promise<ConversationMessagesAround> {
    const collection = await this.messageMetadataCollection();
    const target = await collection.findOne({
      conversationId: conversationId.valueOf(),
      messageId: messageId.valueOf(),
      valid: true,
    });

    if (!target) {
      return { messages: [] };
    }

    const [beforeDocuments, afterDocuments] = await Promise.all([
      collection
        .find({
          conversationId: conversationId.valueOf(),
          createdAt: { $lt: target.createdAt },
          valid: true,
        })
        .limit(before + 1)
        .sort({ createdAt: -1 })
        .toArray(),
      collection
        .find({
          conversationId: conversationId.valueOf(),
          createdAt: { $gt: target.createdAt },
          valid: true,
        })
        .limit(after + 1)
        .sort({ createdAt: 1 })
        .toArray(),
    ]);
    const previousCursor = beforeDocuments[before]?.messageId;
    const nextCursor = afterDocuments[after]?.messageId;
    const windowDocuments = [
      ...beforeDocuments.slice(0, before).reverse(),
      target,
      ...afterDocuments.slice(0, after),
    ];
    const messages: Message[] = [];

    for (const document of windowDocuments) {
      const message = await this.findMessageFromMetadata(document);

      if (message) {
        messages.push(message);
      }
    }

    return {
      messages,
      nextCursor,
      previousCursor,
    };
  }

  public async findThreadMessages(
    conversationId: ConversationId,
    rootMessageId: MessageId,
    limit: number,
  ): Promise<Message[]> {
    const documents = await (
      await this.messageMetadataCollection()
    )
      .find({
        conversationId: conversationId.valueOf(),
        replyToMessageId: rootMessageId.valueOf(),
        valid: true,
      })
      .sort({ createdAt: 1 })
      .limit(limit)
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

  public async findConversationIdsWithMessages(): Promise<string[]> {
    const collection = await this.messageMetadataCollection();

    return collection.distinct('conversationId', { valid: true });
  }

  public async findConversationSyncScopes(): Promise<ConversationSyncScope[]> {
    const documents = await (
      await this.messageMetadataCollection()
    )
      .aggregate<ConversationSyncScope>([
        { $match: { valid: true } },
        {
          $group: {
            _id: {
              conversationId: '$conversationId',
              networkId: '$networkId',
            },
          },
        },
        {
          $project: {
            _id: 0,
            conversationId: '$_id.conversationId',
            networkId: '$_id.networkId',
          },
        },
      ])
      .toArray();

    return documents.filter((document) => document.networkId);
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

  public async republishLocalRoutingRecords(): Promise<number> {
    const documents = await (await this.messageMetadataCollection())
      .find({ valid: true })
      .toArray();
    let republished = 0;

    for (const metadata of documents) {
      try {
        const messageDocument =
          await this.ipfsManager.getJSON<IpfsMessageDocument>(
            new IPFSId(metadata.cid),
          );
        const cid = metadata.networkId
          ? await this.ipfsManager.addJSONToNetworks(messageDocument, [
              metadata.networkId,
            ])
          : await this.ipfsManager.addJSONToAll(messageDocument);

        const routingKey = this.getMessageRoutingKey(
          new ConversationId(metadata.conversationId),
          new MessageId(metadata.messageId),
        );

        if (metadata.networkId) {
          await this.ipfsManager.putRecordToNetworks(
            routingKey,
            cid.valueOf(),
            [metadata.networkId],
          );
        } else {
          await this.ipfsManager.putRecordToAll(routingKey, cid.valueOf());
        }
        republished++;
      } catch {
        continue;
      }
    }

    return republished;
  }

  public async findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
    networkId: NetworkId,
  ): Promise<OneToOneConversation | undefined> {
    const conversation = await this.findById(
      ConversationId.deterministic(
        firstIdentityId,
        secondIdentityId,
        networkId,
      ),
    );

    if (conversation instanceof OneToOneConversation) {
      return conversation;
    }

    return undefined;
  }

  public async markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
  ): Promise<void> {
    const target = await (
      await this.messageMetadataCollection()
    ).findOne({
      conversationId: conversationId.valueOf(),
      messageId: messageId.valueOf(),
      valid: true,
    });

    if (!target) {
      return;
    }

    await (
      await this.unreadCollection()
    ).deleteMany({
      conversationId: conversationId.valueOf(),
      createdAt: { $lte: target.createdAt },
      recipientIdentityId: recipientIdentityId.valueOf(),
    });
  }

  public async registerUnreadForMessage(
    conversation: Conversation,
    message: Message,
  ): Promise<void> {
    if (message.getType().isEqual(MessageType.DELETED)) {
      const targetMessageId = message.getTargetMessageId();

      if (targetMessageId) {
        await this.removeUnreadForMessage(
          message.getConversationId(),
          targetMessageId,
        );
      }

      return;
    }

    if (
      !message.getType().isEqual(MessageType.SENT) &&
      !message.getType().isEqual(MessageType.POLL)
    ) {
      return;
    }

    const conversationPrimitives = conversation.toPrimitives();
    const messagePrimitives = message.toPrimitives();
    const recipientIds = conversationPrimitives.participantIds.filter(
      (participantId) => participantId !== messagePrimitives.authorId,
    );

    for (const recipientId of recipientIds) {
      const document = {
        _id: `${messagePrimitives.conversationId}:${recipientId}:${messagePrimitives.id}`,
        conversationId: messagePrimitives.conversationId,
        createdAt: messagePrimitives.createdAt,
        messageId: messagePrimitives.id,
        networkId: conversationPrimitives.networkId,
        recipientIdentityId: recipientId,
      };

      await (
        await this.unreadCollection()
      ).updateOne(
        { _id: document._id },
        { $setOnInsert: document },
        { upsert: true },
      );
    }
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

      const messageDocument = this.messageMapper.toDocument(domainMessage);
      const networkId = conversation.getNetworkId();
      const cid = await this.ipfsManager.addJSONToNetworks(messageDocument, [
        networkId.valueOf(),
      ]);
      const metadata = this.metadataMapper.toDocument(
        domainMessage,
        cid,
        this.getRecipientIds(conversation, domainMessage),
        networkId,
      );

      await (
        await this.messageMetadataCollection()
      ).updateOne(
        { _id: metadata._id },
        { $setOnInsert: metadata },
        { upsert: true },
      );
      await this.ipfsManager.putRecordToNetworks(
        this.getMessageRoutingKey(
          new ConversationId(message.conversationId),
          new MessageId(message.id),
        ),
        cid.valueOf(),
        [networkId.valueOf()],
      );

      if (domainMessage.getType().isEqual(MessageType.DELETED)) {
        await this.deleteTargetMessageContent(domainMessage);
      }
    }
  }
}
