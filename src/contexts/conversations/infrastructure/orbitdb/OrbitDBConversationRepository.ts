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
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBConversationDocument } from './documents/OrbitDBConversationDocument';
import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';
import OrbitDBConversationMapper from './mappers/OrbitDBConversationMapper';
import OrbitDBConversationMessageMapper from './mappers/OrbitDBConversationMessageMapper';

export default class OrbitDBConversationRepository implements ConversationRepository {
  private readonly conversationIndex: OrbitDBHeadIndex<OrbitDBConversationDocument>;

  private readonly messageIndex: OrbitDBHeadIndex<OrbitDBConversationMessageDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly conversationMapper: OrbitDBConversationMapper,
    private readonly messageMapper: OrbitDBConversationMessageMapper,
  ) {
    this.conversationIndex = new OrbitDBHeadIndex<OrbitDBConversationDocument>(
      this.registry,
      {
        collectionName: 'conversations',
        documentFromRecord: (record) => this.conversationFromRecord(record),
        recordId: (record) =>
          typeof record.id === 'string' ? record.id : undefined,
        shouldReplace: (current, candidate) =>
          this.freshness(current) <= this.freshness(candidate),
      },
    );
    this.messageIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'messages',
      documentFromRecord: (record) => this.messageFromRecord(record),
      documentIds: (document) => [
        ...new Set([document.id, document.messageId]),
      ],
      recordId: (record) => this.messageRecordId(record),
      shouldReplace: (current, candidate) =>
        (current.receivedAt ?? 0) <= (candidate.receivedAt ?? 0),
    });
  }

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
      updatedAt: this.numberValue(record, 'updatedAt'),
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

  private freshness(document: OrbitDBConversationDocument): number {
    return Math.max(
      document.updatedAt ?? 0,
      document.receivedAt ?? 0,
      document.createdAt,
    );
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

  private messageSummaryHeadKey(conversationId: string): string {
    return `conversation-message-summary:${conversationId}`;
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

  private messageRecordId(record: Record<string, unknown>): string | undefined {
    return (
      this.stringValue(record, 'id') || this.stringValue(record, 'messageId')
    );
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

    return (await this.findConversationDocumentById(conversationId))?.networkId;
  }

  private async findParticipantIndexDocuments(
    participantId: string,
  ): Promise<OrbitDBConversationDocument[]> {
    return (
      (await this.conversationIndex.find(
        this.participantIndexHeadKey(participantId),
      )) ?? []
    );
  }

  private async putParticipantIndex(
    participantId: string,
    documents: OrbitDBConversationDocument[],
  ): Promise<void> {
    const conversations = this.conversationIndex.deduplicate(documents);
    const networkIds = [
      ...new Set(conversations.map((conversation) => conversation.networkId)),
    ];

    await this.conversationIndex.putDocuments(
      this.participantIndexHeadKey(participantId),
      {
        id: this.participantIndexHeadKey(participantId),
        participantId,
      },
      conversations,
      { networkIds },
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

    return undefined;
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

    return this.conversationIndex.deduplicate(
      this.registry
        .findCachedHeadsByPrefix('conversation:')
        .map((candidate) => this.conversationFromRecord(candidate))
        .filter(
          (document): document is OrbitDBConversationDocument =>
            document !== undefined &&
            document.participantIds.includes(participantId.valueOf()),
        ),
    );
  }

  private messageSummaryFromRecord(
    record: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const authorId = this.stringValue(record, 'authorId');
    const conversationId = this.stringValue(record, 'conversationId');
    const createdAt = this.numberValue(record, 'createdAt');
    const id =
      this.stringValue(record, 'id') || this.stringValue(record, 'messageId');
    const messageId =
      this.stringValue(record, 'messageId') || this.stringValue(record, 'id');
    const type = this.stringValue(record, 'type');

    if (
      !authorId ||
      !conversationId ||
      createdAt === undefined ||
      !id ||
      !type
    ) {
      return undefined;
    }

    return {
      authorId,
      conversationId,
      createdAt,
      id,
      messageId,
      networkId: this.stringValue(record, 'networkId'),
      type,
      valid: this.booleanValue(record, 'valid'),
    };
  }

  private messageSummaryRecordsFromIndex(
    record: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] | undefined {
    if (!record) {
      return undefined;
    }

    return this.messageIndex
      .recordsFromHead(record)
      .map((message) => this.messageSummaryFromRecord(message))
      .filter(
        (message): message is Record<string, unknown> => message !== undefined,
      );
  }

  private async putMessageSummary(
    conversationId: string,
    records: Array<
      Record<string, unknown> | OrbitDBConversationMessageDocument
    >,
  ): Promise<void> {
    const key = this.messageSummaryHeadKey(conversationId);
    const messages = records
      .map((record) => this.messageSummaryFromRecord({ ...record }))
      .filter(
        (record): record is Record<string, unknown> => record !== undefined,
      )
      .reduce<Record<string, unknown>[]>(
        (merged, record) => this.messageIndex.mergeRecords(merged, record),
        [],
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

  private async putMessageSummaryRecord(
    conversationId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const summary = this.messageSummaryFromRecord(record);

    if (!summary) {
      return;
    }

    const key = this.messageSummaryHeadKey(conversationId);
    const messages = this.messageIndex.mergeRecords(
      this.messageSummaryRecordsFromIndex(await this.registry.findHead(key)) ||
        [],
      summary,
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

  private messageDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBConversationMessageDocument[] {
    return (
      this.messageIndex
        .documentsFromHead(record)
        ?.filter((message) => message.valid !== false) ?? []
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

  private async findMessageSummaryRecords(
    conversationId: string,
  ): Promise<Record<string, unknown>[]> {
    const summary = this.messageSummaryRecordsFromIndex(
      await this.registry.findHead(this.messageSummaryHeadKey(conversationId)),
    );

    if (summary !== undefined) {
      return summary;
    }

    const indexedDocuments =
      await this.findMessageIndexDocuments(conversationId);

    if (indexedDocuments !== undefined) {
      await this.putMessageSummary(conversationId, indexedDocuments);

      return indexedDocuments
        .map((document) => this.messageSummaryFromRecord({ ...document }))
        .filter(
          (document): document is Record<string, unknown> =>
            document !== undefined,
        );
    }

    return [];
  }

  private async putMessageIndexRecord(
    conversationId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.messageIndex.mergeRecords(
      this.messageIndex.recordsFromHead(await this.registry.findHead(key)),
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
    await this.putMessageSummaryRecord(conversationId, record);
  }

  private async putMessageIndex(
    conversationId: string,
    documents: OrbitDBConversationMessageDocument[],
  ): Promise<void> {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.messageIndex.deduplicate(documents);
    const networkIds = [
      ...new Set(
        messages
          .map((message) => message.networkId)
          .filter((networkId): networkId is string => networkId !== undefined),
      ),
    ];

    await this.messageIndex.putDocuments(
      key,
      {
        conversationId,
        id: key,
      },
      messages,
      { networkIds },
    );
    await this.putMessageSummary(conversationId, documents);
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
    return this.messageIndex.deduplicate(documents);
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

    return [];
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

    return this.deduplicateMessages(indexedDocuments);
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

  private isUnreadSummaryFor(
    document: Record<string, unknown>,
    recipientIdentityId: IdentityId,
    readUntilCreatedAt?: number,
  ): boolean {
    const createdAt = this.numberValue(document, 'createdAt');
    const type = this.stringValue(document, 'type');

    return (
      this.booleanValue(document, 'valid') !== false &&
      createdAt !== undefined &&
      (type === MessageType.SENT.valueOf() ||
        type === MessageType.POLL.valueOf()) &&
      this.stringValue(document, 'authorId') !==
        recipientIdentityId.valueOf() &&
      (readUntilCreatedAt === undefined || createdAt > readUntilCreatedAt)
    );
  }

  private messageCreatedAtFromSummary(
    documents: Record<string, unknown>[],
    messageId: string | undefined,
  ): number | undefined {
    if (!messageId) {
      return undefined;
    }

    const document = documents.find(
      (candidate) =>
        this.stringValue(candidate, 'id') === messageId ||
        this.stringValue(candidate, 'messageId') === messageId,
    );

    return document ? this.numberValue(document, 'createdAt') : undefined;
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

  public async findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]> {
    const documents = this.conversationIndex.deduplicate(
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

    const readMarkers = await Promise.all(
      conversationIds.map(async (conversationId) => {
        const marker = await this.registry.findHead(
          `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`,
        );

        return {
          conversationId: conversationId.valueOf(),
          messageCreatedAt: marker
            ? this.numberValue(marker, 'messageCreatedAt')
            : undefined,
          messageId: marker ? this.stringValue(marker, 'messageId') : undefined,
        };
      }),
    );
    const summaries = await Promise.all(
      conversationIds.map(async (conversationId) => ({
        conversationId: conversationId.valueOf(),
        documents: await this.findMessageSummaryRecords(
          conversationId.valueOf(),
        ),
      })),
    );
    const summariesByConversationId = new Map(
      summaries.map((summary) => [summary.conversationId, summary.documents]),
    );
    const readUntilByConversationId = new Map<string, number | undefined>(
      readMarkers.map((marker) => {
        const documents =
          summariesByConversationId.get(marker.conversationId) || [];

        return [
          marker.conversationId,
          marker.messageCreatedAt ??
            this.messageCreatedAtFromSummary(documents, marker.messageId),
        ];
      }),
    );

    for (const summary of summaries) {
      const readUntil = readUntilByConversationId.get(summary.conversationId);

      for (const document of summary.documents) {
        if (
          this.isUnreadSummaryFor(document, recipientIdentityId, readUntil) ===
          false
        ) {
          continue;
        }

        counts.set(
          summary.conversationId,
          (counts.get(summary.conversationId) || 0) + 1,
        );
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

    await this.registry.putHead(
      `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`,
      {
        conversationId: conversationId.valueOf(),
        messageCreatedAt,
        messageId: messageId.valueOf(),
        networkId: markerNetworkId,
        readAt: Timestamp.now().valueOf(),
        recipientIdentityId: recipientIdentityId.valueOf(),
      },
      markerNetworkId ? [markerNetworkId] : [],
    );
  }

  public async save(conversation: Conversation): Promise<void> {
    const conversationId = conversation.getId();
    const existingDocument =
      await this.findConversationDocumentById(conversationId);
    const document = this.conversationMapper.toDocument(
      conversation,
      new Timestamp(existingDocument?.createdAt ?? Timestamp.now().valueOf()),
    );

    await this.registry.putDocument('conversations', { ...document });
    await this.putConversationHeads(document);

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
