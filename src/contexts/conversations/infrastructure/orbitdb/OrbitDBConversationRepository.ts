import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationMessageCandidate } from '@app/contexts/conversations/domain/repositories/types/ConversationMessageCandidate';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/repositories/types/ConversationMessagesAround';
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

  private conversationHeadKey(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  private participantIndexHeadKey(participantId: string): string {
    return `conversation-participant-index:${participantId}`;
  }

  private messageIndexHeadKey(conversationId: string): string {
    return `conversation-message-index:${conversationId}`;
  }

  private conversationDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBConversationDocument[] {
    const conversations = record?.conversations;

    if (!Array.isArray(conversations)) {
      return [];
    }

    return conversations
      .filter(
        (conversation): conversation is Record<string, unknown> =>
          typeof conversation === 'object' &&
          conversation !== null &&
          !Array.isArray(conversation),
      )
      .map((conversation) => this.conversationFromRecord(conversation))
      .filter(
        (document): document is OrbitDBConversationDocument =>
          document !== undefined,
      );
  }

  private async findParticipantIndexDocuments(
    participantId: string,
  ): Promise<OrbitDBConversationDocument[]> {
    return this.conversationDocumentsFromIndex(
      await this.registry.findHead(this.participantIndexHeadKey(participantId)),
    );
  }

  private async putParticipantIndex(
    participantId: string,
    documents: OrbitDBConversationDocument[],
  ): Promise<void> {
    const conversations = this.deduplicateConversations(documents);
    const networkIds = [
      ...new Set(conversations.map((conversation) => conversation.networkId)),
    ];

    await this.registry.putHead(
      this.participantIndexHeadKey(participantId),
      {
        conversations: conversations.map((conversation) => ({
          ...conversation,
        })),
        id: this.participantIndexHeadKey(participantId),
        participantId,
        updatedAt: Date.now(),
      },
      networkIds,
    );
  }

  private async putConversationHeads(
    document: OrbitDBConversationDocument,
  ): Promise<void> {
    await this.registry.putHead(this.conversationHeadKey(document.id), {
      ...document,
    });
    await Promise.all(
      document.participantIds.map(async (participantId) =>
        this.putParticipantIndex(participantId, [
          ...(await this.findParticipantIndexDocuments(participantId)),
          document,
        ]),
      ),
    );
  }

  private async findConversationDocumentById(
    conversationId: ConversationId,
  ): Promise<OrbitDBConversationDocument | undefined> {
    const head = await this.registry.findHead(
      this.conversationHeadKey(conversationId.valueOf()),
    );
    const headDocument = head ? this.conversationFromRecord(head) : undefined;

    if (headDocument) {
      return headDocument;
    }

    const [document] = this.deduplicateConversations(
      await this.findConversationDocuments(
        (candidate) =>
          this.stringValue(candidate, 'id') === conversationId.valueOf(),
      ),
    );

    if (document) {
      await this.putConversationHeads(document);
    }

    return document;
  }

  private async findConversationDocumentsByParticipant(
    participantId: IdentityId,
  ): Promise<OrbitDBConversationDocument[]> {
    const indexedDocuments = await this.findParticipantIndexDocuments(
      participantId.valueOf(),
    );

    if (indexedDocuments.length > 0) {
      return indexedDocuments;
    }

    const documents = this.deduplicateConversations(
      await this.findConversationDocuments(
        (candidate) =>
          this.stringArrayValue(candidate, 'participantIds')?.includes(
            participantId.valueOf(),
          ) === true,
      ),
    );

    await this.putParticipantIndex(participantId.valueOf(), documents);
    await Promise.all(
      documents.map((document) =>
        this.registry.putHead(this.conversationHeadKey(document.id), {
          ...document,
        }),
      ),
    );

    return documents;
  }

  private rawMessageRecordsFromIndex(
    record: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    const messages = record?.messages;

    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.filter(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' &&
        message !== null &&
        !Array.isArray(message),
    );
  }

  private messageDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBConversationMessageDocument[] {
    return this.rawMessageRecordsFromIndex(record)
      .filter((message) => this.booleanValue(message, 'valid') !== false)
      .map((message) => this.messageFromRecord(message))
      .filter(
        (document): document is OrbitDBConversationMessageDocument =>
          document !== undefined,
      );
  }

  private async findMessageIndexDocuments(
    conversationId: string,
  ): Promise<OrbitDBConversationMessageDocument[] | undefined> {
    const head = await this.registry.findHead(
      this.messageIndexHeadKey(conversationId),
    );

    return head ? this.messageDocumentsFromIndex(head) : undefined;
  }

  private mergeIndexedMessageRecord(
    records: Record<string, unknown>[],
    record: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const recordId =
      this.stringValue(record, 'id') || this.stringValue(record, 'messageId');

    if (!recordId) {
      return records;
    }

    const merged = new Map<string, Record<string, unknown>>();

    for (const current of records) {
      const currentId =
        this.stringValue(current, 'id') ||
        this.stringValue(current, 'messageId');

      if (currentId) {
        merged.set(currentId, current);
      }
    }

    merged.set(recordId, record);

    return [...merged.values()];
  }

  private async putMessageIndexRecord(
    conversationId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.mergeIndexedMessageRecord(
      this.rawMessageRecordsFromIndex(await this.registry.findHead(key)),
      record,
    );
    const networkIds = [
      ...new Set(
        messages
          .map((message) => this.stringValue(message, 'networkId'))
          .filter((networkId): networkId is string => networkId !== undefined),
      ),
    ];

    await this.registry.putHead(
      key,
      {
        conversationId,
        id: key,
        messages: messages.map((message) => ({ ...message })),
        updatedAt: Date.now(),
      },
      networkIds,
    );
  }

  private async putMessageIndex(
    conversationId: string,
    documents: OrbitDBConversationMessageDocument[],
  ): Promise<void> {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.deduplicateMessages(documents);
    const networkIds = [
      ...new Set(
        messages
          .map((message) => message.networkId)
          .filter((networkId): networkId is string => networkId !== undefined),
      ),
    ];

    await this.registry.putHead(
      key,
      {
        conversationId,
        id: key,
        messages: messages.map((message) => ({ ...message })),
        updatedAt: Date.now(),
      },
      networkIds,
    );
  }

  private async putMessageRecord(
    record: Record<string, unknown>,
  ): Promise<void> {
    await this.registry.putDocument('messages', { ...record });

    const conversationId = this.stringValue(record, 'conversationId');

    if (conversationId) {
      await this.putMessageIndexRecord(conversationId, record);
    }
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

  private async findMessageDocumentsByConversationId(
    conversationId: ConversationId,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    const indexedDocuments = await this.findMessageIndexDocuments(
      conversationId.valueOf(),
    );

    if (indexedDocuments !== undefined) {
      return indexedDocuments;
    }

    const documents = this.deduplicateMessages(
      await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation' &&
          this.stringValue(candidate, 'conversationId') ===
            conversationId.valueOf(),
      ),
    );

    await this.putMessageIndex(conversationId.valueOf(), documents);

    return documents;
  }

  private async findMessageDocumentsByConversationIds(
    conversationIds: ConversationId[],
  ): Promise<OrbitDBConversationMessageDocument[]> {
    const indexedResults = await Promise.all(
      conversationIds.map(async (conversationId) => ({
        conversationId,
        documents: await this.findMessageIndexDocuments(
          conversationId.valueOf(),
        ),
      })),
    );
    const indexedDocuments = indexedResults
      .filter(
        (
          result,
        ): result is {
          conversationId: ConversationId;
          documents: OrbitDBConversationMessageDocument[];
        } => result.documents !== undefined,
      )
      .flatMap((result) => result.documents);
    const missingConversationIds = indexedResults
      .filter((result) => result.documents === undefined)
      .map((result) => result.conversationId);

    if (missingConversationIds.length === 0) {
      return this.deduplicateMessages(indexedDocuments);
    }

    const missingConversationIdValues = new Set(
      missingConversationIds.map((conversationId) => conversationId.valueOf()),
    );
    const missingDocuments = this.deduplicateMessages(
      await this.findMessageDocuments(
        (candidate) =>
          this.stringValue(candidate, 'scopeType') === 'conversation' &&
          missingConversationIdValues.has(
            this.stringValue(candidate, 'conversationId') || '',
          ),
      ),
    );
    const documentsByConversationId = new Map<
      string,
      OrbitDBConversationMessageDocument[]
    >();

    for (const document of missingDocuments) {
      documentsByConversationId.set(document.conversationId, [
        ...(documentsByConversationId.get(document.conversationId) || []),
        document,
      ]);
    }

    await Promise.all(
      missingConversationIds.map((conversationId) =>
        this.putMessageIndex(
          conversationId.valueOf(),
          documentsByConversationId.get(conversationId.valueOf()) || [],
        ),
      ),
    );

    return this.deduplicateMessages([...indexedDocuments, ...missingDocuments]);
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
    return (
      await this.findMessageDocumentsByConversationId(conversationId)
    ).find(
      (document) =>
        document.id === messageId.valueOf() ||
        document.messageId === messageId.valueOf(),
    );
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
    const document = await this.findConversationDocumentById(conversationId);

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
    const document = await this.findConversationDocumentById(conversationId);

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
    return (await this.findMessageDocumentsByConversationId(conversationId))
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
      await this.findConversationDocumentsByParticipant(participantId),
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

    const readMarkers = await Promise.all(
      conversationIds.map(async (conversationId) => {
        const marker = await this.registry.findHead(
          `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`,
        );

        return {
          conversationId: conversationId.valueOf(),
          messageId: marker ? this.stringValue(marker, 'messageId') : undefined,
        };
      }),
    );
    const documents =
      await this.findMessageDocumentsByConversationIds(conversationIds);
    const documentsByMessageId = new Map(
      documents.map((document) => [
        `${document.conversationId}:${document.id}`,
        document,
      ]),
    );
    const readUntilByConversationId = new Map<string, number | undefined>(
      readMarkers.map((marker) => [
        marker.conversationId,
        marker.messageId
          ? documentsByMessageId.get(
              `${marker.conversationId}:${marker.messageId}`,
            )?.createdAt
          : undefined,
      ]),
    );

    for (const document of documents) {
      const readUntil = readUntilByConversationId.get(document.conversationId);

      if (
        this.isUnreadFor(document, recipientIdentityId, readUntil) === false
      ) {
        continue;
      }

      counts.set(
        document.conversationId,
        (counts.get(document.conversationId) || 0) + 1,
      );
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
    const existingDocument = await this.findConversationDocumentById(
      conversation.getId(),
    );
    const document = this.conversationMapper.toDocument(
      conversation,
      new Timestamp(existingDocument?.createdAt ?? Timestamp.now().valueOf()),
    );

    await this.registry.putDocument('conversations', { ...document });
    await this.putConversationHeads(document);

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

      await this.putMessageRecord({
        ...this.messageMapper.toDocument(conversation, domainMessage),
      });

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
