import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';
import OrbitDBConversationMessageIndex from './OrbitDBConversationMessageIndex';

export default class OrbitDBConversationMessageSummaryIndex {
  private readonly index: OrbitDBHeadIndex<Record<string, unknown>>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly messageIndex: OrbitDBConversationMessageIndex,
  ) {
    this.index = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'messages',
      documentFromRecord: (record) => this.summaryFromRecord(record),
      recordId: (record) =>
        this.stringValue(record, 'id') || this.stringValue(record, 'messageId'),
    });
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

  private booleanValue(
    document: Record<string, unknown>,
    attribute: string,
  ): boolean | undefined {
    const value = document[attribute];

    return typeof value === 'boolean' ? value : undefined;
  }

  private messageSummaryHeadKey(conversationId: string): string {
    return `conversation-message-summary:${conversationId}`;
  }

  private summaryFromRecord(
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

  private recordsFromHead(
    head: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] | undefined {
    if (!head) {
      return undefined;
    }

    return this.index.documentsFromHead(head);
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

  public async findRecords(
    conversationId: string,
  ): Promise<Record<string, unknown>[]> {
    const summary = this.recordsFromHead(
      await this.registry.findHead(this.messageSummaryHeadKey(conversationId)),
    );

    if (summary !== undefined) {
      return summary;
    }

    const indexedDocuments =
      await this.messageIndex.findByConversationId(conversationId);

    if (indexedDocuments !== undefined) {
      await this.put(conversationId, indexedDocuments);

      return indexedDocuments
        .map((document) => this.summaryFromRecord({ ...document }))
        .filter(
          (document): document is Record<string, unknown> =>
            document !== undefined,
        );
    }

    return [];
  }

  public async put(
    conversationId: string,
    records: Array<
      Record<string, unknown> | OrbitDBConversationMessageDocument
    >,
  ): Promise<void> {
    const key = this.messageSummaryHeadKey(conversationId);
    const messages = records
      .map((record) => this.summaryFromRecord({ ...record }))
      .filter(
        (record): record is Record<string, unknown> => record !== undefined,
      )
      .reduce<Record<string, unknown>[]>(
        (merged, record) => this.index.mergeRecords(merged, record),
        [],
      );

    await this.registry.putHead(
      key,
      {
        conversationId,
        id: key,
        messages: messages.map((message) => ({ ...message })),
        updatedAt: Date.now(),
      },
      this.networkIdsFrom(messages),
    );
  }

  public async putRecord(
    conversationId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const summary = this.summaryFromRecord(record);

    if (!summary) {
      return;
    }

    const key = this.messageSummaryHeadKey(conversationId);
    const messages = this.index.mergeRecords(
      this.recordsFromHead(await this.registry.findHead(key)) || [],
      summary,
    );

    await this.registry.putHead(
      key,
      {
        conversationId,
        id: key,
        messages: messages.map((message) => ({ ...message })),
        updatedAt: Date.now(),
      },
      this.networkIdsFrom(messages),
    );
  }

  public replicateRecordInBackground(
    conversationId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const summary = this.summaryFromRecord(record);

    if (!summary) {
      return Promise.resolve();
    }

    const key = this.messageSummaryHeadKey(conversationId);
    const messages = this.index.mergeRecords(
      this.recordsFromHead(this.registry.findCachedHead(key)) || [],
      summary,
    );

    return this.index.replicateRecordInBackground(
      key,
      {
        conversationId,
        id: key,
      },
      summary,
      this.networkIdsFrom(messages),
    );
  }

  public messageCreatedAtFrom(
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

  public isUnreadFor(
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
}
