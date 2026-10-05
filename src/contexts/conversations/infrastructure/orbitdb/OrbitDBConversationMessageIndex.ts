import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';

export default class OrbitDBConversationMessageIndex {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {}

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

  private isCompleteDocument(
    document: Partial<OrbitDBConversationMessageDocument>,
  ): document is OrbitDBConversationMessageDocument {
    return [
      document.authorId,
      document.conversationId,
      document.createdAt,
      document.id,
      document.previousMessageIds,
      document.scopeType,
      document.type,
    ].every((value) => value !== undefined);
  }

  private documentFromRecord(
    record: Record<string, unknown>,
  ): OrbitDBConversationMessageDocument | undefined {
    const document: Partial<OrbitDBConversationMessageDocument> = {
      authorId: this.stringValue(record, 'authorId'),
      conversationId: this.stringValue(record, 'conversationId'),
      createdAt: this.numberValue(record, 'createdAt'),
      encryptedPayload: this.stringValue(record, 'encryptedPayload'),
      id: this.stringValue(record, 'id'),
      pollId: this.stringValue(record, 'pollId'),
      previousMessageIds: this.stringArrayValue(record, 'previousMessageIds'),
      replyToMessageId: this.stringValue(record, 'replyToMessageId'),
      scopeType: this.stringValue(record, 'scopeType') as
        OrbitDBConversationMessageDocument['scopeType'] | undefined,
      targetMessageId: this.stringValue(record, 'targetMessageId'),
      type: this.stringValue(record, 'type'),
    };

    return this.isCompleteDocument(document) &&
      document.scopeType === 'conversation'
      ? document
      : undefined;
  }

  /**
   * A message is hidden when a `deleted` message written by the same author
   * targets it. The author is checked on read, so the outcome does not depend
   * on the order in which records replicate.
   */
  private withoutDeletedTargets(
    documents: OrbitDBConversationMessageDocument[],
  ): OrbitDBConversationMessageDocument[] {
    const deleters = new Map<string, Set<string>>();

    for (const document of documents) {
      if (
        document.type !== MessageType.DELETED.valueOf() ||
        !document.targetMessageId
      ) {
        continue;
      }

      const authors = deleters.get(document.targetMessageId) ?? new Set();

      authors.add(document.authorId);
      deleters.set(document.targetMessageId, authors);
    }

    return documents.filter(
      (document) => !deleters.get(document.id)?.has(document.authorId),
    );
  }

  private async findAllByConversationId(
    conversationId: ConversationId | string,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    const value =
      conversationId instanceof ConversationId
        ? conversationId.valueOf()
        : conversationId;
    const records = await this.registry.queryDocuments(
      'messages',
      (document) =>
        document.conversationId === value &&
        document.scopeType === 'conversation',
    );

    return this.deduplicate(
      records
        .map((record) => this.documentFromRecord(record))
        .filter(
          (document): document is OrbitDBConversationMessageDocument =>
            document !== undefined,
        ),
    );
  }

  public documentIds(
    documents: OrbitDBConversationMessageDocument[],
  ): Set<string> {
    return new Set(documents.map((document) => document.id));
  }

  public deduplicate(
    documents: OrbitDBConversationMessageDocument[],
  ): OrbitDBConversationMessageDocument[] {
    return [
      ...new Map(documents.map((document) => [document.id, document])).values(),
    ];
  }

  /** Every stored message id, including messages hidden by their deletion. */
  public async findStoredIds(
    conversationId: ConversationId,
  ): Promise<Set<string>> {
    return this.documentIds(await this.findAllByConversationId(conversationId));
  }

  public async findByConversationId(
    conversationId: ConversationId | string,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    return this.withoutDeletedTargets(
      await this.findAllByConversationId(conversationId),
    );
  }

  public async findById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<OrbitDBConversationMessageDocument | undefined> {
    return (await this.findByConversationId(conversationId)).find(
      (document) => document.id === messageId.valueOf(),
    );
  }
}
