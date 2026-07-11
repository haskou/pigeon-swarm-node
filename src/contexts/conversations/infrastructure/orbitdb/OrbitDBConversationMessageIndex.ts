import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
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
        OrbitDBConversationMessageDocument['scopeType'] | undefined,
      signature: this.stringValue(record, 'signature'),
      targetMessageId: this.stringValue(record, 'targetMessageId'),
      type: this.stringValue(record, 'type') as
        OrbitDBConversationMessageDocument['type'] | undefined,
      valid: this.booleanValue(record, 'valid'),
    };

    return this.isCompleteDocument(document) &&
      document.scopeType === 'conversation'
      ? document
      : undefined;
  }

  public documentIds(
    documents: OrbitDBConversationMessageDocument[],
  ): Set<string> {
    return new Set(
      documents.flatMap((document) => [document.id, document.messageId]),
    );
  }

  public deduplicate(
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

  public async findByConversationId(
    conversationId: ConversationId | string,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    const value =
      conversationId instanceof ConversationId
        ? conversationId.valueOf()
        : conversationId;
    const documents = await this.registry.queryDocuments(
      'messages',
      (document) =>
        document.conversationId === value &&
        document.scopeType === 'conversation' &&
        document.valid !== false,
    );
    const mappedDocuments = documents
      .map((document) => this.documentFromRecord(document))
      .filter(
        (document): document is OrbitDBConversationMessageDocument =>
          document !== undefined && document.valid !== false,
      );

    return this.deduplicate(mappedDocuments);
  }

  public async findById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<OrbitDBConversationMessageDocument | undefined> {
    return (await this.findByConversationId(conversationId)).find(
      (document) =>
        document.id === messageId.valueOf() ||
        document.messageId === messageId.valueOf(),
    );
  }
}
