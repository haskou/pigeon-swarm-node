import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/ConversationMessagesAround';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';
import OrbitDBConversationMapper from './mappers/OrbitDBConversationMapper';
import OrbitDBConversationMessageMapper from './mappers/OrbitDBConversationMessageMapper';
import OrbitDBConversationIndex from './OrbitDBConversationIndex';
import OrbitDBConversationMessageIndex from './OrbitDBConversationMessageIndex';

export default class OrbitDBConversationRepository implements ConversationRepository {
  private readonly conversationIndex: OrbitDBConversationIndex;

  private readonly messageIndex: OrbitDBConversationMessageIndex;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly conversationMapper: OrbitDBConversationMapper,
    private readonly messageMapper: OrbitDBConversationMessageMapper,
  ) {
    this.conversationIndex = new OrbitDBConversationIndex(this.registry);
    this.messageIndex = new OrbitDBConversationMessageIndex(this.registry);
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private messageCreatedAtFromExternalId(
    conversationId: ConversationId,
    messageId: MessageId,
  ): number | undefined {
    const prefix = `${conversationId.valueOf()}:`;
    const value = messageId.valueOf();

    if (!value.startsWith(prefix)) {
      return undefined;
    }

    const [createdAt] = value.slice(prefix.length).split(':');
    const timestamp = Number(createdAt);

    return Number.isInteger(timestamp) ? timestamp : undefined;
  }

  private async readMarkerNetworkId(
    conversationId: ConversationId,
    message?: OrbitDBConversationMessageDocument,
    networkId?: NetworkId,
  ): Promise<string | undefined> {
    if (networkId) {
      return networkId.valueOf();
    }

    if (message?.networkId) {
      return message.networkId;
    }

    return (await this.conversationIndex.findById(conversationId))?.networkId;
  }

  private async putMessageRecord(
    record: Record<string, unknown>,
  ): Promise<void> {
    await this.registry.putDocument('messages', { ...record });
  }

  private deduplicateMessages(
    documents: OrbitDBConversationMessageDocument[],
  ): OrbitDBConversationMessageDocument[] {
    return this.messageIndex.deduplicate(documents);
  }

  private async findMessageDocumentsByConversationId(
    conversationId: ConversationId,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    return this.messageIndex.findByConversationId(conversationId);
  }

  private async unreadCountForConversation(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
  ): Promise<[string, number]> {
    const [marker, documents] = await Promise.all([
      this.registry.findHead(
        this.readMarkerHeadKey(conversationId, recipientIdentityId),
      ),
      this.findMessageDocumentsByConversationId(conversationId),
    ]);
    const messageId = marker
      ? this.stringValue(marker, 'messageId')
      : undefined;
    const readUntil =
      (marker ? this.numberValue(marker, 'messageCreatedAt') : undefined) ??
      documents.find(
        (document) =>
          document.id === messageId || document.messageId === messageId,
      )?.createdAt;
    const unreadCount = documents.filter((document) =>
      this.isUnreadFor(document, recipientIdentityId, readUntil),
    ).length;

    return [conversationId.valueOf(), unreadCount];
  }

  private async readMarkerMessageCreatedAt(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
  ): Promise<number | undefined> {
    const marker = await this.registry.findHead(
      this.readMarkerHeadKey(conversationId, recipientIdentityId),
    );
    const messageId = marker
      ? this.stringValue(marker, 'messageId')
      : undefined;

    if (!messageId) {
      return undefined;
    }

    const message = await this.findMessageDocumentById(
      conversationId,
      new MessageId(messageId),
    );

    return message?.createdAt;
  }

  private readMarkerHeadKey(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
  ): string {
    return `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`;
  }

  private async findMessageDocumentById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<OrbitDBConversationMessageDocument | undefined> {
    return this.messageIndex.findById(conversationId, messageId);
  }

  private messageDocumentIds(
    documents: OrbitDBConversationMessageDocument[],
  ): Set<string> {
    return this.messageIndex.documentIds(documents);
  }

  private async findMessagesByConversationId(
    conversationId: ConversationId,
  ): Promise<Message[]> {
    return (await this.findMessageDocumentsByConversationId(conversationId))
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.messageMapper.toDomain(document));
  }

  private isUnreadFor(
    document: OrbitDBConversationMessageDocument,
    recipientIdentityId: IdentityId,
    readUntilCreatedAt?: number,
  ): boolean {
    return (
      (document.type === MessageType.SENT.valueOf() ||
        document.type === MessageType.POLL.valueOf()) &&
      document.authorId !== recipientIdentityId.valueOf() &&
      (readUntilCreatedAt === undefined ||
        document.createdAt > readUntilCreatedAt)
    );
  }

  public async findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const document = await this.conversationIndex.findById(conversationId);

    return document
      ? this.conversationMapper.toDomain(
          document,
          await this.findMessagesByConversationId(conversationId),
        )
      : undefined;
  }

  public async findMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const document = await this.conversationIndex.findById(conversationId);

    return document ? this.conversationMapper.toDomain(document) : undefined;
  }

  public async findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    return this.findMessageById(conversationId, messageId);
  }

  public async findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]> {
    const documents = this.conversationIndex.deduplicate(
      await this.conversationIndex.findByParticipant(participantId),
    );
    const beforeDocument = beforeConversationId
      ? documents.find(
          (document) => document.id === beforeConversationId.valueOf(),
        )
      : undefined;

    return documents
      .filter((document) =>
        beforeDocument ? document.createdAt < beforeDocument.createdAt : true,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map((document) => this.conversationMapper.toDomain(document));
  }

  public async findLatestMessages(
    conversationId: ConversationId,
    limit: number,
    beforeMessageId?: MessageId,
  ): Promise<Message[]> {
    const documents =
      await this.findMessageDocumentsByConversationId(conversationId);
    const beforeDocument = beforeMessageId
      ? documents.find((document) => document.id === beforeMessageId.valueOf())
      : undefined;

    return documents
      .filter((document) =>
        beforeDocument ? document.createdAt < beforeDocument.createdAt : true,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .reverse()
      .map((document) => this.messageMapper.toDomain(document));
  }

  public async findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    const document = await this.findMessageDocumentById(
      conversationId,
      messageId,
    );

    return document ? this.messageMapper.toDomain(document) : undefined;
  }

  public async hasMessage(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean> {
    return (
      (await this.findMessageDocumentById(conversationId, messageId)) !==
      undefined
    );
  }

  public async findMessagesAround(
    conversationId: ConversationId,
    messageId: MessageId,
    before: number,
    after: number,
  ): Promise<ConversationMessagesAround> {
    const documents = (
      await this.findMessageDocumentsByConversationId(conversationId)
    ).sort((left, right) => left.createdAt - right.createdAt);
    const targetIndex = documents.findIndex(
      (document) => document.id === messageId.valueOf(),
    );

    if (targetIndex === -1) {
      return new ConversationMessagesAround([]);
    }

    const start = Math.max(0, targetIndex - before);
    const end = Math.min(documents.length, targetIndex + after + 1);

    return new ConversationMessagesAround(
      documents
        .slice(start, end)
        .map((document) => this.messageMapper.toDomain(document)),
      documents[targetIndex + after + 1]?.id
        ? new MessageId(documents[targetIndex + after + 1].id)
        : undefined,
      documents[targetIndex - before - 1]?.id
        ? new MessageId(documents[targetIndex - before - 1].id)
        : undefined,
    );
  }

  public async findThreadMessages(
    conversationId: ConversationId,
    rootMessageId: MessageId,
    limit: number,
  ): Promise<Message[]> {
    const documents = (
      await this.findMessageDocumentsByConversationId(conversationId)
    ).filter(
      (document) => document.replyToMessageId === rootMessageId.valueOf(),
    );

    return this.deduplicateMessages(documents)
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, limit)
      .map((document) => this.messageMapper.toDomain(document));
  }

  public async countUnreadByRecipient(
    recipientIdentityId: IdentityId,
    conversationIds: ConversationId[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (conversationIds.length === 0) {
      return counts;
    }

    const unreadCounts = await Promise.all(
      conversationIds.map((conversationId) =>
        this.unreadCountForConversation(recipientIdentityId, conversationId),
      ),
    );

    for (const [conversationId, unreadCount] of unreadCounts) {
      if (unreadCount > 0) {
        counts.set(conversationId, unreadCount);
      }
    }

    return counts;
  }

  public async hasUnreadMessageForRecipient(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean> {
    const document = await this.findMessageDocumentById(
      conversationId,
      messageId,
    );

    if (!document) {
      return false;
    }

    return this.isUnreadFor(
      document,
      recipientIdentityId,
      await this.readMarkerMessageCreatedAt(
        conversationId,
        recipientIdentityId,
      ),
    );
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

    return conversation instanceof OneToOneConversation
      ? conversation
      : undefined;
  }

  public async markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
    networkId?: NetworkId,
  ): Promise<void> {
    const externalMessageCreatedAt = this.messageCreatedAtFromExternalId(
      conversationId,
      messageId,
    );
    const message =
      externalMessageCreatedAt !== undefined
        ? undefined
        : await this.findMessageDocumentById(conversationId, messageId);
    const messageCreatedAt = externalMessageCreatedAt ?? message?.createdAt;

    if (messageCreatedAt === undefined) {
      return;
    }

    const markerNetworkId = await this.readMarkerNetworkId(
      conversationId,
      message,
      networkId,
    );

    const marker = {
      conversationId: conversationId.valueOf(),
      messageCreatedAt,
      messageId: messageId.valueOf(),
      networkId: markerNetworkId,
      readAt: Timestamp.now().valueOf(),
      recipientIdentityId: recipientIdentityId.valueOf(),
    };
    const markerNetworkIds = markerNetworkId ? [markerNetworkId] : [];
    const key = this.readMarkerHeadKey(conversationId, recipientIdentityId);

    this.registry.replicateHeadInBackground(key, marker, markerNetworkIds);
  }

  public async save(conversation: Conversation): Promise<void> {
    const conversationId = conversation.getId();
    const existingDocument =
      await this.conversationIndex.findById(conversationId);
    const document = this.conversationMapper.toDocument(
      conversation,
      new Timestamp(existingDocument?.createdAt ?? Timestamp.now().valueOf()),
    );

    await this.registry.putDocument('conversations', { ...document });
    this.conversationIndex.replicateInBackground(document);

    const existingMessageIds = this.messageDocumentIds(
      await this.findMessageDocumentsByConversationId(conversationId),
    );

    for (const message of conversation.toPrimitives().messages) {
      const messageId = new MessageId(message.id);

      if (existingMessageIds.has(messageId.valueOf())) {
        continue;
      }

      const domainMessage = conversation.findMessageById(messageId);

      if (!domainMessage) {
        continue;
      }

      await this.putMessageRecord({
        ...this.messageMapper.toDocument(conversation, domainMessage),
      });
      existingMessageIds.add(messageId.valueOf());

      const targetMessageId = domainMessage.getTargetMessageId();

      if (
        domainMessage.getType().isEqual(MessageType.DELETED) &&
        targetMessageId
      ) {
        await this.putMessageRecord({
          ...this.messageMapper.tombstone(
            message.conversationId,
            targetMessageId.valueOf(),
          ),
        });
      }
    }
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    return Promise.resolve(0);
  }
}
