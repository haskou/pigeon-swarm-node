import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';

export default class OrbitDBConversationMessageIndex {
  private readonly index: OrbitDBHeadIndex<OrbitDBConversationMessageDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    this.index = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'messages',
      documentFromRecord: (record) => this.documentFromRecord(record),
      documentIds: (document) => [
        ...new Set([document.id, document.messageId]),
      ],
      recordId: (record) => this.recordId(record),
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

  private isCompleteDocument(
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

  private documentFromRecord(
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

    return this.isCompleteDocument(document) &&
      document.scopeType === 'conversation'
      ? document
      : undefined;
  }

  private messageIndexHeadKey(conversationId: string): string {
    return `conversation-message-index:${conversationId}`;
  }

  private documentsFromHead(
    head: Record<string, unknown> | undefined,
  ): OrbitDBConversationMessageDocument[] {
    return (
      this.index
        .documentsFromHead(head)
        ?.filter((message) => message.valid !== false) ?? []
    );
  }

  private recordId(record: Record<string, unknown>): string | undefined {
    return (
      this.stringValue(record, 'id') || this.stringValue(record, 'messageId')
    );
  }

  private networkIdsFrom(records: Record<string, unknown>[]): string[] {
    return [
      ...new Set(
        records
          .map((message) => this.stringValue(message, 'networkId'))
          .filter((networkId): networkId is string => networkId !== undefined),
      ),
    ];
  }

  public recordsFromHead(
    head: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    return this.index.recordsFromHead(head);
  }

  public mergeRecords(
    records: Record<string, unknown>[],
    record: Record<string, unknown>,
  ): Record<string, unknown>[] {
    return this.index.mergeRecords(records, record);
  }

  public documentIds(
    documents: OrbitDBConversationMessageDocument[],
  ): Set<string> {
    return this.index.documentIds(documents);
  }

  public deduplicate(
    documents: OrbitDBConversationMessageDocument[],
  ): OrbitDBConversationMessageDocument[] {
    return this.index.deduplicate(documents);
  }

  public async findByConversationId(
    conversationId: ConversationId | string,
  ): Promise<OrbitDBConversationMessageDocument[] | undefined> {
    const value =
      conversationId instanceof ConversationId
        ? conversationId.valueOf()
        : conversationId;
    const head = await this.registry.findHead(this.messageIndexHeadKey(value));

    return head ? this.documentsFromHead(head) : undefined;
  }

  public async findById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<OrbitDBConversationMessageDocument | undefined> {
    return (await this.findByConversationId(conversationId))?.find(
      (document) =>
        document.id === messageId.valueOf() ||
        document.messageId === messageId.valueOf(),
    );
  }

  public async putRecord(
    conversationId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.index.mergeRecords(
      this.index.recordsFromHead(await this.registry.findHead(key)),
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

  public replicateRecordInBackground(
    conversationId: string,
    record: Record<string, unknown>,
  ): void {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.index.mergeRecords(
      this.index.recordsFromHead(this.registry.findCachedHead(key)),
      record,
    );

    this.index.replicateRecordInBackground(
      key,
      {
        conversationId,
        id: key,
      },
      record,
      this.networkIdsFrom(messages),
    );
  }

  public async putDocuments(
    conversationId: string,
    documents: OrbitDBConversationMessageDocument[],
  ): Promise<void> {
    const key = this.messageIndexHeadKey(conversationId);
    const messages = this.index.deduplicate(documents);
    const networkIds = [
      ...new Set(
        messages
          .map((message) => message.networkId)
          .filter((networkId): networkId is string => networkId !== undefined),
      ),
    ];

    await this.index.putDocuments(
      key,
      {
        conversationId,
        id: key,
      },
      messages,
      { networkIds },
    );
  }
}
