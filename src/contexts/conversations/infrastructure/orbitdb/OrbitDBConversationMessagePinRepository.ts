import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { ConversationMessagePin } from '../../domain/ConversationMessagePin';
import ConversationMessagePinRepository from '../../domain/repositories/ConversationMessagePinRepository';
import { OrbitDBConversationMessagePinDocument } from './documents/OrbitDBConversationMessagePinDocument';

export default class OrbitDBConversationMessagePinRepository extends ConversationMessagePinRepository {
  private readonly pinIndex: OrbitDBHeadIndex<OrbitDBConversationMessagePinDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.pinIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'pins',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.freshness(current) <= this.freshness(candidate),
    });
  }

  private pinId(conversationId: ConversationId, messageId: MessageId): string {
    return `conversation:${conversationId.valueOf()}:${messageId.valueOf()}`;
  }

  private indexHeadKey(conversationId: ConversationId): string {
    return `conversation-pin-index:${conversationId.valueOf()}`;
  }

  private freshness(document: Record<string, unknown>): number {
    return Math.max(
      typeof document.updatedAt === 'number' ? document.updatedAt : 0,
      typeof document.createdAt === 'number' ? document.createdAt : 0,
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBConversationMessagePinDocument {
    return (
      document.removed !== true &&
      typeof document.id === 'string' &&
      typeof document.conversationId === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.messageId === 'string' &&
      typeof document.pinnedByIdentityId === 'string'
    );
  }

  private putIndexDocument(
    conversationId: ConversationId,
    document: Record<string, unknown>,
  ): void {
    const key = this.indexHeadKey(conversationId);

    this.pinIndex.replicateRecordInBackground(
      key,
      {
        conversationId: conversationId.valueOf(),
        id: key,
      },
      document,
    );
  }

  private toPin(
    document: OrbitDBConversationMessagePinDocument,
  ): ConversationMessagePin {
    return new ConversationMessagePin(
      new MessageId(document.messageId),
      new IdentityId(document.pinnedByIdentityId),
      new Timestamp(document.createdAt),
    );
  }

  public async pin(
    conversationId: ConversationId,
    messageId: MessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    const document = {
      conversationId: conversationId.valueOf(),
      createdAt: createdAt.valueOf(),
      id: this.pinId(conversationId, messageId),
      messageId: messageId.valueOf(),
      pinnedByIdentityId: pinnedByIdentityId.valueOf(),
      scopeType: 'conversation',
    };

    await this.registry.putDocument('pins', document);
    this.putIndexDocument(conversationId, document);
  }

  public async unpin(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<void> {
    const document = {
      conversationId: conversationId.valueOf(),
      id: this.pinId(conversationId, messageId),
      messageId: messageId.valueOf(),
      removed: true,
      scopeType: 'conversation',
      updatedAt: Date.now(),
    };

    await this.registry.putDocument('pins', document);
    this.putIndexDocument(conversationId, document);
  }

  public async findByConversation(
    conversationId: ConversationId,
  ): Promise<ConversationMessagePin[]> {
    const indexedDocuments = await this.pinIndex.find(
      this.indexHeadKey(conversationId),
    );
    const documents = indexedDocuments ?? [];

    return documents
      .filter((document): document is OrbitDBConversationMessagePinDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((document) => this.toPin(document));
  }
}
