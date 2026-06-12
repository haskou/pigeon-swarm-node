import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBMessageReactionDocument } from './documents/OrbitDBMessageReactionDocument';
import OrbitDBMessageReactionMapper from './mappers/OrbitDBMessageReactionMapper';

// eslint-disable-next-line max-len
export default class OrbitDBMessageReactionRepository extends MessageReactionRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBMessageReactionMapper,
  ) {
    super();
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBMessageReactionDocument {
    return (
      value.removed !== true &&
      value.scopeType === 'conversation' &&
      this.hasStringFields(value, [
        'authorId',
        'conversationId',
        'emoji',
        'id',
        'messageId',
      ]) &&
      typeof value.createdAt === 'number'
    );
  }

  private indexHeadKey(conversationId: ConversationId): string {
    return `conversation-reaction-index:${conversationId.valueOf()}`;
  }

  private freshness(document: Record<string, unknown>): number {
    return Math.max(
      typeof document.updatedAt === 'number' ? document.updatedAt : 0,
      typeof document.createdAt === 'number' ? document.createdAt : 0,
    );
  }

  private rawDocumentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] | undefined {
    if (!record) {
      return undefined;
    }

    const reactions = record.reactions;

    if (!Array.isArray(reactions)) {
      return [];
    }

    return reactions.filter(
      (reaction): reaction is Record<string, unknown> =>
        typeof reaction === 'object' &&
        reaction !== null &&
        !Array.isArray(reaction),
    );
  }

  private mergeDocuments(
    documents: Record<string, unknown>[],
    document: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const merged = new Map<string, Record<string, unknown>>();

    for (const current of documents) {
      if (typeof current.id === 'string') {
        merged.set(current.id, current);
      }
    }

    if (typeof document.id === 'string') {
      const current = merged.get(document.id);

      if (!current || this.freshness(current) <= this.freshness(document)) {
        merged.set(document.id, document);
      }
    }

    return [...merged.values()].filter((reaction) => reaction.removed !== true);
  }

  private async putIndex(
    conversationId: ConversationId,
    documents: Record<string, unknown>[],
  ): Promise<void> {
    const key = this.indexHeadKey(conversationId);
    const reactions = documents.reduce(
      (merged, document) => this.mergeDocuments(merged, document),
      [] as Record<string, unknown>[],
    );

    await this.registry.putHead(key, {
      conversationId: conversationId.valueOf(),
      id: key,
      reactions: reactions.map((reaction) => ({ ...reaction })),
      updatedAt: Date.now(),
    });
  }

  private async putIndexDocument(
    conversationId: ConversationId,
    document: Record<string, unknown>,
  ): Promise<void> {
    await this.putIndex(conversationId, [
      ...(this.rawDocumentsFromIndex(
        await this.registry.findHead(this.indexHeadKey(conversationId)),
      ) || []),
      document,
    ]);
  }

  public async save(reaction: MessageReaction): Promise<void> {
    const document = this.mapper.toDocument(reaction);

    await this.registry.putDocument('reactions', document);
    await this.putIndexDocument(
      new ConversationId(document.conversationId),
      document,
    );
  }

  public async delete(reaction: MessageReaction): Promise<void> {
    const document = {
      ...this.mapper.toDocument(reaction),
      removed: true,
      updatedAt: Date.now(),
    };

    await this.registry.putDocument('reactions', document);
    await this.putIndexDocument(
      new ConversationId(document.conversationId),
      document,
    );
  }

  public async findByMessageIds(
    conversationId: ConversationId,
    messageIds: MessageId[],
  ): Promise<MessageReaction[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const messageIdValues = new Set(
      messageIds.map((messageId) => messageId.valueOf()),
    );
    const indexedDocuments = this.rawDocumentsFromIndex(
      await this.registry.findHead(this.indexHeadKey(conversationId)),
    );
    const documents = indexedDocuments ?? [];

    return documents
      .filter((document): document is OrbitDBMessageReactionDocument =>
        this.isDocument(document),
      )
      .filter((document) => messageIdValues.has(document.messageId))
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.mapper.toDomain(document));
  }

  public async findCandidates(
    conversationId: ConversationId,
  ): Promise<MessageReaction[]> {
    const indexedDocuments = this.rawDocumentsFromIndex(
      await this.registry.findHead(this.indexHeadKey(conversationId)),
    );
    const documents = indexedDocuments ?? [];

    return documents
      .filter((document): document is OrbitDBMessageReactionDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.mapper.toDomain(document));
  }
}
