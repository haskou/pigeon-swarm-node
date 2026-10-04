import { MessageReaction } from '@app/contexts/conversations/domain/entities/messages/MessageReaction';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
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
        PublicMutationRecord.replaces(current, candidate) ?? true,
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
    const hasRequiredFields =
      value.removed !== true &&
      value.scopeType === 'conversation' &&
      this.hasStringFields(value, [
        'authorId',
        'conversationId',
        'emoji',
        'id',
        'messageId',
      ]) &&
      typeof value.createdAt === 'number';

    if (!hasRequiredFields) return false;
    const candidate = value as OrbitDBMessageReactionDocument;

    try {
      const reaction = this.mapper.toDomain(candidate);

      return candidate.id === this.mapper.toDocument(reaction).id;
    } catch {
      return false;
    }
  }

  private indexHeadKey(conversationId: ConversationId): string {
    return this.indexHeadKeyFromValue(conversationId.valueOf());
  }

  private indexHeadKeyFromValue(conversationId: string): string {
    return `conversation-reaction-index:${conversationId}`;
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

  private async write(
    payload: OrbitDBMessageReactionDocument | Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const conversationId = new ConversationId(String(payload.conversationId));
    const document = PublicMutationRecord.withProof(payload, proof);

    PublicMutationRecord.assertNotStale(
      (
        await this.reactionIndex.findRecords(this.indexHeadKey(conversationId))
      ).filter((stored) => stored.id === payload.id),
      document,
    );
    await this.registry.putDocument('reactions', document);
    this.putIndexDocument(conversationId, document);
  }

  public async save(
    reaction: MessageReaction,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(this.mapper.toDocument(reaction), proof);
  }

  public async delete(
    reaction: MessageReaction,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = Object.fromEntries(
      Object.entries(this.mapper.toDocument(reaction)).filter(
        ([key]) => key !== 'createdAt',
      ),
    );

    await this.write({ ...document, removed: true }, proof);
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
