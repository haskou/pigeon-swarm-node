import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
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
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private pinId(conversationId: ConversationId, messageId: MessageId): string {
    return `conversation:${conversationId.valueOf()}:${messageId.valueOf()}`;
  }

  private indexHeadKey(conversationId: ConversationId): string {
    return this.indexHeadKeyFromValue(conversationId.valueOf());
  }

  private indexHeadKeyFromValue(conversationId: string): string {
    return `conversation-pin-index:${conversationId}`;
  }

  private hasRequiredFields(document: Record<string, unknown>): boolean {
    const stringFields = [
      'conversationId',
      'id',
      'messageId',
      'pinnedByIdentityId',
    ];

    return (
      document.removed !== true &&
      document.scopeType === 'conversation' &&
      typeof document.createdAt === 'number' &&
      stringFields.every((field) => typeof document[field] === 'string')
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBConversationMessagePinDocument {
    if (!this.hasRequiredFields(document)) return false;
    const candidate = document as OrbitDBConversationMessagePinDocument;

    try {
      const conversationId = new ConversationId(candidate.conversationId);
      const messageId = new MessageId(candidate.messageId);
      this.toPin(candidate);

      return candidate.id === this.pinId(conversationId, messageId);
    } catch {
      return false;
    }
  }

  private putIndexDocument(
    conversationId: ConversationId,
    document: Record<string, unknown>,
  ): void {
    const key = this.indexHeadKey(conversationId);

    void this.pinIndex.replicateRecordInBackground(
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

  private async write(
    conversationId: ConversationId,
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);

    PublicMutationRecord.assertNotStale(
      (
        await this.pinIndex.findRecords(this.indexHeadKey(conversationId))
      ).filter((stored) => stored.id === payload.id),
      document,
    );
    await this.registry.putDocument('pins', document);
    this.putIndexDocument(conversationId, document);
  }

  public async pin(
    conversationId: ConversationId,
    messageId: MessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      conversationId,
      {
        conversationId: conversationId.valueOf(),
        createdAt: createdAt.valueOf(),
        id: this.pinId(conversationId, messageId),
        messageId: messageId.valueOf(),
        pinnedByIdentityId: pinnedByIdentityId.valueOf(),
        scopeType: 'conversation',
      },
      proof,
    );
  }

  public async unpin(
    conversationId: ConversationId,
    messageId: MessageId,
    unpinnedByIdentityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(
      conversationId,
      {
        conversationId: conversationId.valueOf(),
        id: this.pinId(conversationId, messageId),
        messageId: messageId.valueOf(),
        pinnedByIdentityId: unpinnedByIdentityId.valueOf(),
        removed: true,
        scopeType: 'conversation',
      },
      proof,
    );
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
