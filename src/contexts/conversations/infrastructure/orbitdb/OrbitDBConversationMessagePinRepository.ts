import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import ConversationMessagePinRepository from '../../domain/repositories/ConversationMessagePinRepository';
import { ConversationMessagePin } from '../../domain/repositories/types/ConversationMessagePin';
import { OrbitDBConversationMessagePinDocument } from './documents/OrbitDBConversationMessagePinDocument';

// eslint-disable-next-line max-len
export default class OrbitDBConversationMessagePinRepository extends ConversationMessagePinRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private pinId(conversationId: ConversationId, messageId: MessageId): string {
    return `conversation:${conversationId.valueOf()}:${messageId.valueOf()}`;
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

  private toPin(
    document: OrbitDBConversationMessagePinDocument,
  ): ConversationMessagePin {
    return {
      createdAt: document.createdAt,
      messageId: document.messageId,
      pinnedByIdentityId: document.pinnedByIdentityId,
    };
  }

  public async pin(
    conversationId: ConversationId,
    messageId: MessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp = Timestamp.now(),
  ): Promise<void> {
    await this.registry.putDocument('pins', {
      conversationId: conversationId.valueOf(),
      createdAt: createdAt.valueOf(),
      id: this.pinId(conversationId, messageId),
      messageId: messageId.valueOf(),
      pinnedByIdentityId: pinnedByIdentityId.valueOf(),
      scopeType: 'conversation',
    });
  }

  public async unpin(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<void> {
    await this.registry.putDocument('pins', {
      conversationId: conversationId.valueOf(),
      id: this.pinId(conversationId, messageId),
      messageId: messageId.valueOf(),
      removed: true,
      scopeType: 'conversation',
      updatedAt: Date.now(),
    });
  }

  public async findByConversation(
    conversationId: ConversationId,
  ): Promise<ConversationMessagePin[]> {
    const documents = await this.registry.queryDocuments(
      'pins',
      (document) =>
        document.scopeType === 'conversation' &&
        document.conversationId === conversationId.valueOf(),
    );

    return documents
      .filter((document): document is OrbitDBConversationMessagePinDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((document) => this.toPin(document));
  }
}
