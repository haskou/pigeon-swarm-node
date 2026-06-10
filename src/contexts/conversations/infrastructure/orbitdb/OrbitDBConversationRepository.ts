import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationMessageCandidate } from '@app/contexts/conversations/domain/repositories/types/ConversationMessageCandidate';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/repositories/types/ConversationMessagesAround';
import { ConversationSyncScope } from '@app/contexts/conversations/domain/repositories/types/ConversationSyncScope';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBConversationDocument } from './documents/OrbitDBConversationDocument';
import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';
import OrbitDBConversationMapper from './mappers/OrbitDBConversationMapper';
import OrbitDBConversationMessageMapper from './mappers/OrbitDBConversationMessageMapper';

// eslint-disable-next-line max-len
export default class OrbitDBConversationRepository implements ConversationRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly conversationMapper: OrbitDBConversationMapper,
    private readonly messageMapper: OrbitDBConversationMessageMapper,
  ) {}

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] | undefined {
    const value = document[attribute];

    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.every((item) => typeof item === 'string') ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private booleanValue(
    document: Record<string, unknown>,
    attribute: string,
  ): boolean | undefined {
    const value = document[attribute];

    return typeof value === 'boolean' ? value : undefined;
  }

  private isCompleteConversation(
    document: Partial<OrbitDBConversationDocument>,
  ): document is OrbitDBConversationDocument {
    return [
      document.createdAt,
      document.id,
      document.networkId,
      document.participantIds,
      document.type,
    ].every((value) => value !== undefined);
  }

  private isCompleteMessage(
    document: Partial<OrbitDBConversationMessageDocument>,
  ): document is OrbitDBConversationMessageDocument {
    return [
      document.authorId,
      document.conversationId,
      document.createdAt,
      document.id,
      document.messageId,
      document.previousMessageIds,
      document.scopeType,
      document.signature,
      document.type,
    ].every((value) => value !== undefined);
  }

  private conversationFromRecord(
    record: Record<string, unknown>,
  ): OrbitDBConversationDocument | undefined {
    const document: Partial<OrbitDBConversationDocument> = {
      createdAt: this.numberValue(record, 'createdAt') ?? 0,
      id: this.stringValue(record, 'id'),
      lastEventId: this.stringValue(record, 'lastEventId'),
      lastEventType: this.stringValue(record, 'lastEventType'),
      name: this.stringValue(record, 'name'),
      networkId: this.stringValue(record, 'networkId'),
      participantIds: this.stringArrayValue(record, 'participantIds'),
      receivedAt: this.numberValue(record, 'receivedAt'),
      type: this.stringValue(record, 'type') as
        | OrbitDBConversationDocument['type']
        | undefined,
    };

    return this.isCompleteConversation(document) ? document : undefined;
  }

  private messageFromRecord(
    record: Record<string, unknown>,
  ): OrbitDBConversationMessageDocument | undefined {
    const document: Partial<OrbitDBConversationMessageDocument> = {
      attachmentExternalIdentifiers:
        this.stringArrayValue(record, 'attachmentExternalIdentifiers') ?? [],
      authorId: this.stringValue(record, 'authorId'),
      conversationId: this.stringValue(record, 'conversationId'),
      createdAt: this.numberValue(record, 'createdAt'),
      encryptedPayload: this.stringValue(record, 'encryptedPayload'),
      id:
        this.stringValue(record, 'id') || this.stringValue(record, 'messageId'),
      lastEventId: this.stringValue(record, 'lastEventId'),
      lastEventType: this.stringValue(record, 'lastEventType'),
      messageId:
        this.stringValue(record, 'messageId') || this.stringValue(record, 'id'),
      networkId: this.stringValue(record, 'networkId'),
      pollId: this.stringValue(record, 'pollId'),
      previousMessageIds:
        this.stringArrayValue(record, 'previousMessageIds') ?? [],
      receivedAt: this.numberValue(record, 'receivedAt'),
      recipientIds: this.stringArrayValue(record, 'recipientIds'),
      replyToMessageId: this.stringValue(record, 'replyToMessageId'),
      scopeType: this.stringValue(record, 'scopeType') as
        | OrbitDBConversationMessageDocument['scopeType']
        | undefined,
      signature: this.stringValue(record, 'signature'),
      targetMessageId: this.stringValue(record, 'targetMessageId'),
      type: this.stringValue(record, 'type') as
        | OrbitDBConversationMessageDocument['type']
        | undefined,
      valid: this.booleanValue(record, 'valid'),
    };

    return this.isCompleteMessage(document) &&
      document.scopeType === 'conversation'
      ? document
      : undefined;
  }

  private async findConversationDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<OrbitDBConversationDocument[]> {
    const documents = await this.registry.queryDocuments(
      'conversations',
      matcher,
    );

    return documents
      .map((document) => this.conversationFromRecord(document))
      .filter(
        (document): document is OrbitDBConversationDocument =>
          document !== undefined,
      );
  }

  private async findMessageDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    const documents = await this.registry.queryDocuments('messages', matcher);

    return documents
      .filter((document) => this.booleanValue(document, 'valid') !== false)
      .map((document) => this.messageFromRecord(document))
      .filter(
        (document): document is OrbitDBConversationMessageDocument =>
          document !== undefined,
      );
  }

  private deduplicateConversations(
    documents: OrbitDBConversationDocument[],
  ): OrbitDBConversationDocument[] {
    const deduplicated = new Map<string, OrbitDBConversationDocument>();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || current.createdAt <= document.createdAt) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private deduplicateMessages(
    documents: OrbitDBConversationMessageDocument[],
  ): OrbitDBConversationMessageDocument[] {
    const deduplicated = new Map<string, OrbitDBConversationMessageDocument>();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || (current.receivedAt ?? 0) <= (document.receivedAt ?? 0)) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private async readMarkerMessageCreatedAt(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
  ): Promise<number | undefined> {
    const marker = await this.registry.findHead(
      `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`,
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

  private async findMessageDocumentById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<OrbitDBConversationMessageDocument | undefined> {
    const [document] = this.deduplicateMessages(
      await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation' &&
          this.stringValue(candidate, 'conversationId') ===
            conversationId.valueOf() &&
          (this.stringValue(candidate, 'id') === messageId.valueOf() ||
            this.stringValue(candidate, 'messageId') === messageId.valueOf()),
      ),
    );

    return document;
  }

  private async findMessagesByConversationId(
    conversationId: ConversationId,
  ): Promise<Message[]> {
    const documents = await this.findMessageDocuments(
      (candidate) =>
        this.stringValue(candidate, 'scopeType') === 'conversation' &&
        this.stringValue(candidate, 'conversationId') ===
          conversationId.valueOf(),
    );

    return this.deduplicateMessages(documents)
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
    const metadata = await this.findMetadataById(conversationId);

    if (!metadata) {
      return undefined;
    }

    const [document] = await this.findConversationDocuments(
      (candidate) =>
        this.stringValue(candidate, 'id') === conversationId.valueOf(),
    );

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
    const [document] = this.deduplicateConversations(
      await this.findConversationDocuments(
        (candidate) =>
          this.stringValue(candidate, 'id') === conversationId.valueOf(),
      ),
    );

    return document ? this.conversationMapper.toDomain(document) : undefined;
  }

  public async findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    return this.findMessageById(conversationId, messageId);
  }

  public async findMessageCandidates(
    conversationId: ConversationId,
    limit: number,
  ): Promise<ConversationMessageCandidate[]> {
    const documents = await this.findMessageDocuments(
      (candidate) =>
        this.stringValue(candidate, 'scopeType') === 'conversation' &&
        this.stringValue(candidate, 'conversationId') ===
          conversationId.valueOf(),
    );

    return this.deduplicateMessages(documents)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .reverse()
      .map((document) => ({
        authorIdentityId: document.authorId,
        createdAt: document.createdAt,
        messageId: document.id,
        messageType: document.type,
      }));
  }

  public async findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]> {
    const documents = this.deduplicateConversations(
      await this.findConversationDocuments(
        (candidate) =>
          this.stringArrayValue(candidate, 'participantIds')?.includes(
            participantId.valueOf(),
          ) === true,
      ),
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
    const documents = this.deduplicateMessages(
      await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation' &&
          this.stringValue(candidate, 'conversationId') ===
            conversationId.valueOf(),
      ),
    );
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
    const documents = this.deduplicateMessages(
      await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation' &&
          this.stringValue(candidate, 'conversationId') ===
            conversationId.valueOf(),
      ),
    ).sort((left, right) => left.createdAt - right.createdAt);
    const targetIndex = documents.findIndex(
      (document) => document.id === messageId.valueOf(),
    );

    if (targetIndex === -1) {
      return { messages: [] };
    }

    const start = Math.max(0, targetIndex - before);
    const end = Math.min(documents.length, targetIndex + after + 1);

    return {
      messages: documents
        .slice(start, end)
        .map((document) => this.messageMapper.toDomain(document)),
      nextCursor: documents[targetIndex + after + 1]?.id,
      previousCursor: documents[targetIndex - before - 1]?.id,
    };
  }

  public async findThreadMessages(
    conversationId: ConversationId,
    rootMessageId: MessageId,
    limit: number,
  ): Promise<Message[]> {
    const documents = await this.findMessageDocuments(
      (candidate) =>
        this.stringValue(candidate, 'scopeType') === 'conversation' &&
        this.stringValue(candidate, 'conversationId') ===
          conversationId.valueOf() &&
        this.stringValue(candidate, 'replyToMessageId') ===
          rootMessageId.valueOf(),
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

    for (const conversationId of conversationIds) {
      const readUntil = await this.readMarkerMessageCreatedAt(
        conversationId,
        recipientIdentityId,
      );
      const documents = await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation' &&
          this.stringValue(candidate, 'conversationId') ===
            conversationId.valueOf(),
      );
      const count = this.deduplicateMessages(documents).filter((document) =>
        this.isUnreadFor(document, recipientIdentityId, readUntil),
      ).length;

      if (count > 0) {
        counts.set(conversationId.valueOf(), count);
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

  public async findConversationSyncScopes(): Promise<ConversationSyncScope[]> {
    const documents = this.deduplicateMessages(
      await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation',
      ),
    );
    const scopesById = new Map<string, ConversationSyncScope>();

    for (const document of documents) {
      if (!document.networkId) {
        continue;
      }

      scopesById.set(`${document.networkId}:${document.conversationId}`, {
        conversationId: document.conversationId,
        networkId: document.networkId,
      });
    }

    return [...scopesById.values()];
  }

  public async markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
  ): Promise<void> {
    const message = await this.findMessageDocumentById(
      conversationId,
      messageId,
    );

    if (!message) {
      return;
    }

    await this.registry.putHead(
      `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`,
      {
        messageId: message.id,
        networkId: message.networkId,
        readAt: Timestamp.now().valueOf(),
      },
    );
  }

  public async registerUnreadForMessage(): Promise<void> {
    return Promise.resolve();
  }

  public async save(conversation: Conversation): Promise<void> {
    const existing = await this.findConversationDocuments(
      (candidate) =>
        this.stringValue(candidate, 'id') === conversation.getId().valueOf(),
    );
    const [existingDocument] = this.deduplicateConversations(existing);
    const document = this.conversationMapper.toDocument(
      conversation,
      new Timestamp(existingDocument?.createdAt ?? Timestamp.now().valueOf()),
    );

    await this.registry.putDocument('conversations', { ...document });

    for (const message of conversation.toPrimitives().messages) {
      const messageId = new MessageId(message.id);
      const existingMessage = await this.findMessageById(
        new ConversationId(message.conversationId),
        messageId,
      );

      if (existingMessage) {
        continue;
      }

      const domainMessage = conversation.findMessageById(messageId);

      if (!domainMessage) {
        continue;
      }

      await this.registry.putDocument('messages', {
        ...this.messageMapper.toDocument(conversation, domainMessage),
      });

      const targetMessageId = domainMessage.getTargetMessageId();

      if (
        domainMessage.getType().isEqual(MessageType.DELETED) &&
        targetMessageId
      ) {
        await this.registry.putDocument('messages', {
          ...this.messageMapper.tombstone(
            message.conversationId,
            targetMessageId.valueOf(),
          ),
        });
      }
    }
  }

  public async findConversationIdsWithMessages(): Promise<string[]> {
    const scopes = await this.findConversationSyncScopes();

    return [...new Set(scopes.map((scope) => scope.conversationId))];
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    return Promise.resolve(0);
  }
}
