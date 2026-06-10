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

  private async findDocuments(
    matcher: (document: OrbitDBMessageReactionDocument) => boolean,
  ): Promise<OrbitDBMessageReactionDocument[]> {
    const documents = await this.registry.queryDocuments(
      'reactions',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents
      .filter((document): document is OrbitDBMessageReactionDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  public async save(reaction: MessageReaction): Promise<void> {
    await this.registry.putDocument(
      'reactions',
      this.mapper.toDocument(reaction),
    );
  }

  public async delete(reaction: MessageReaction): Promise<void> {
    await this.registry.putDocument('reactions', {
      ...this.mapper.toDocument(reaction),
      removed: true,
    });
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
    const documents = await this.findDocuments(
      (document) =>
        new ConversationId(document.conversationId).isEqual(conversationId) &&
        messageIdValues.has(document.messageId),
    );

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async findCandidates(
    conversationId: ConversationId,
  ): Promise<MessageReaction[]> {
    const documents = await this.findDocuments((document) =>
      new ConversationId(document.conversationId).isEqual(conversationId),
    );

    return documents.map((document) => this.mapper.toDomain(document));
  }
}
