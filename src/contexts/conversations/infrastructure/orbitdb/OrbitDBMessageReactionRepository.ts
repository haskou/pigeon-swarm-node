import { MessageReaction } from '@app/contexts/conversations/domain/entities/messages/MessageReaction';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBMessageReactionDocument } from './documents/OrbitDBMessageReactionDocument';
import OrbitDBMessageReactionMapper from './mappers/OrbitDBMessageReactionMapper';

export default class OrbitDBMessageReactionRepository extends MessageReactionRepository {
  private readonly reactionIndex: OrbitDBHeadIndex<OrbitDBMessageReactionDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBMessageReactionMapper,
  ) {
    super();
    this.reactionIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'reactions',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
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

  private putIndexDocument(
    conversationId: ConversationId,
    document: Record<string, unknown>,
  ): void {
    const key = this.indexHeadKey(conversationId);

    void this.reactionIndex.replicateRecordInBackground(
      key,
      {
        conversationId: conversationId.valueOf(),
        id: key,
      },
      document,
    );
  }

  public async save(reaction: MessageReaction): Promise<void> {
    const document = this.mapper.toDocument(reaction);

    await this.registry.putDocument('reactions', document);
    this.putIndexDocument(
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
    this.putIndexDocument(
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
    const indexedDocuments = await this.reactionIndex.find(
      this.indexHeadKey(conversationId),
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
    const indexedDocuments = await this.reactionIndex.find(
      this.indexHeadKey(conversationId),
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
