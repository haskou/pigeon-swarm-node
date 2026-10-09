import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { ConversationMessagesAround } from '@app/contexts/conversations/domain/ConversationMessagesAround';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { GroupConversation } from '@app/contexts/conversations/domain/GroupConversation';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationLimits } from '@app/contexts/conversations/domain/operations/ConversationOperationLimits';
import { ConversationRoster } from '@app/contexts/conversations/domain/operations/ConversationRoster';
import { ConversationState } from '@app/contexts/conversations/domain/operations/ConversationState';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBConversationMessageDocument } from './documents/OrbitDBConversationMessageDocument';
import OrbitDBConversationMessageMapper from './mappers/OrbitDBConversationMessageMapper';
import OrbitDBConversationMessageIndex from './OrbitDBConversationMessageIndex';

type FoldedConversation = { createdAt: number; roster: ConversationRoster };

/**
 * Conversations exist only as the signed operations replicated in the
 * `conversationOperations` store. Every conversation read here is the
 * deterministic fold of those operations, so nothing a peer replicates can
 * state a participant or a role that no authorized member signed. The
 * participant index is not replicated: it is the fold of the cached logs.
 */
export default class OrbitDBConversationRepository implements ConversationRepository {
  private static readonly HEAD_PREFIX = 'conversation-operation-index:';
  private static readonly MAX_FOLDED_CONVERSATIONS = 2_048;

  private readonly folded = new Map<
    string,
    { createdAt: number; signature: string; state: ConversationState }
  >();

  private readonly messageIndex: OrbitDBConversationMessageIndex;

  private readonly operationIndex: OrbitDBHeadIndex<Record<string, unknown>>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly messageMapper: OrbitDBConversationMessageMapper,
  ) {
    this.messageIndex = new OrbitDBConversationMessageIndex(this.registry);
    this.operationIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'conversationOperations',
      documentFromRecord: (record) => record,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
    this.registry.registerHeadRecordMerger(
      OrbitDBConversationRepository.HEAD_PREFIX,
      (current, candidate) => this.mergeHeads(current, candidate),
    );
  }

  private headKey(conversationId: ConversationId | string): string {
    return `${OrbitDBConversationRepository.HEAD_PREFIX}${conversationId.valueOf()}`;
  }

  /**
   * Replicas sign operations of one conversation concurrently, so two heads
   * of the same conversation are never superseded: their operations are
   * unioned and sorted, which makes every replica publish the same head.
   */
  private mergeHeads(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!current) return candidate;

    const operations = this.operationIndex
      .recordsFromHead(candidate)
      .reduce(
        (records, record) => this.operationIndex.mergeRecords(records, record),
        this.operationIndex.recordsFromHead(current),
      )
      .sort((left, right) => (String(left.id) < String(right.id) ? -1 : 1));

    return {
      ...candidate,
      conversationOperations: operations,
      updatedAt: Math.max(
        Number(current.updatedAt) || 0,
        Number(candidate.updatedAt) || 0,
      ),
    };
  }

  private operationsOf(
    conversationId: string,
    records: Record<string, unknown>[],
  ): ConversationOperation[] {
    return records.flatMap((record) => {
      try {
        const operation = ConversationOperation.fromPrimitives(
          PublicMutationRecord.payloadOf(record),
        );

        return operation.getConversationId().valueOf() === conversationId
          ? [operation]
          : [];
      } catch {
        return [];
      }
    });
  }

  /** The state of one conversation, folded again only when its operations changed. */
  private stateOf(
    conversationId: string,
    records: Record<string, unknown>[],
  ): { createdAt: number; state: ConversationState } {
    const signature = records
      .map((record) => String(record.id))
      .sort()
      .join('\n');
    const known = this.folded.get(conversationId);

    if (known?.signature === signature) return known;

    const operations = this.operationsOf(conversationId, records);
    const state = ConversationStateFold.fold(operations);
    const skipped = new Set(state.skipped);
    const createdAt = Math.min(
      ...operations
        .filter(
          (operation) =>
            operation.isGenesis() && !skipped.has(operation.getHash()),
        )
        .map((operation) => operation.getCreatedAt()),
    );
    const entry = {
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      signature,
      state,
    };

    this.folded.delete(conversationId);
    this.folded.set(conversationId, entry);

    if (
      this.folded.size > OrbitDBConversationRepository.MAX_FOLDED_CONVERSATIONS
    ) {
      this.folded.delete(this.folded.keys().next().value as string);
    }

    return entry;
  }

  private async findState(
    conversationId: ConversationId,
  ): Promise<ConversationState | undefined> {
    const records = await this.operationIndex.findRecords(
      this.headKey(conversationId),
    );

    return records.length === 0
      ? undefined
      : this.stateOf(conversationId.valueOf(), records).state;
  }

  private async findFolded(
    conversationId: ConversationId,
  ): Promise<FoldedConversation | undefined> {
    const records = await this.operationIndex.findRecords(
      this.headKey(conversationId),
    );

    if (records.length === 0) return undefined;

    const { createdAt, state } = this.stateOf(
      conversationId.valueOf(),
      records,
    );

    return state.roster ? { createdAt, roster: state.roster } : undefined;
  }

  /** Every conversation whose operations are cached locally, newest first. */
  private cachedConversations(): FoldedConversation[] {
    return this.registry
      .findCachedHeadsByPrefix(OrbitDBConversationRepository.HEAD_PREFIX)
      .flatMap((head) => {
        const conversationId = head.conversationId;

        if (typeof conversationId !== 'string') return [];

        const { createdAt, state } = this.stateOf(
          conversationId,
          this.operationIndex.recordsFromHead(head),
        );

        return state.roster ? [{ createdAt, roster: state.roster }] : [];
      })
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          left.roster.getId().localeCompare(right.roster.getId()),
      );
  }

  private conversationOf(
    found: FoldedConversation,
    messages: Message[] = [],
  ): Conversation {
    const { admins, creator, id, members, name, networkId, type } =
      found.roster.toPrimitives();
    const primitives = {
      adminIds: admins,
      creatorId: creator,
      id,
      messages: messages.map((message) => message.toPrimitives()),
      name,
      networkId,
      participantIds: members,
      type,
    };

    return type === 'group'
      ? GroupConversation.fromPrimitives(primitives)
      : OneToOneConversation.fromPrimitives(primitives);
  }

  /** Fails with the limit error a client can show, before the write is refused deeper down. */
  private assertWithinQuota(
    conversationId: string,
    records: Record<string, unknown>[],
    operation: ConversationOperation,
  ): void {
    const author = operation.getAuthorIdentityId().valueOf();

    if (
      !ConversationOperationLimits.isAuthorQuotaReached(
        records.filter(
          (record) =>
            PublicMutationRecord.payloadOf(record).authorIdentityId === author,
        ).length,
      )
    ) {
      return;
    }

    ConversationOperationLimits.assertAuthorQuota(
      ConversationStateFold.closureOf(
        this.operationsOf(conversationId, records),
        operation.getParents(),
      ),
      operation,
    );
  }

  private assertAllProofed(
    messages: { id: string }[],
    proofs: ReadonlyMap<string, PublicMutationProof>,
  ): void {
    if (messages.some((message) => !proofs.has(message.id))) {
      throw new InvalidPublicMutationError();
    }
  }

  private async putMessage(
    conversation: Conversation,
    messageId: string,
    proofs: ReadonlyMap<string, PublicMutationProof>,
  ): Promise<void> {
    const domainMessage = conversation.findMessageById(
      new MessageId(messageId),
    );
    const proof = proofs.get(messageId);

    if (!domainMessage || !proof) {
      return;
    }

    await this.registry.putDocument(
      'messages',
      PublicMutationRecord.withProof(
        this.messageMapper.toDocument(domainMessage),
        proof,
      ),
    );
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

  private messageCreatedAtFromExternalId(
    conversationId: ConversationId,
    messageId: MessageId,
  ): number | undefined {
    const prefix = `${conversationId.valueOf()}:`;
    const value = messageId.valueOf();

    if (!value.startsWith(prefix)) {
      return undefined;
    }

    const [createdAt] = value.slice(prefix.length).split(':');
    const timestamp = Number(createdAt);

    return Number.isInteger(timestamp) ? timestamp : undefined;
  }

  private async readMarkerNetworkId(
    conversationId: ConversationId,
    networkId?: NetworkId,
  ): Promise<string | undefined> {
    if (networkId) {
      return networkId.valueOf();
    }

    return (await this.findFolded(conversationId))?.roster.getNetworkId();
  }

  private deduplicateMessages(
    documents: OrbitDBConversationMessageDocument[],
  ): OrbitDBConversationMessageDocument[] {
    return this.messageIndex.deduplicate(documents);
  }

  private async findMessageDocumentsByConversationId(
    conversationId: ConversationId,
  ): Promise<OrbitDBConversationMessageDocument[]> {
    return this.messageIndex.findByConversationId(conversationId);
  }

  private async unreadCountForConversation(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
  ): Promise<[string, number]> {
    const [marker, documents] = await Promise.all([
      this.registry.findHead(
        this.readMarkerHeadKey(conversationId, recipientIdentityId),
      ),
      this.findMessageDocumentsByConversationId(conversationId),
    ]);
    const messageId = marker
      ? this.stringValue(marker, 'messageId')
      : undefined;
    const readUntil =
      (marker ? this.numberValue(marker, 'messageCreatedAt') : undefined) ??
      documents.find((document) => document.id === messageId)?.createdAt;
    const unreadCount = documents.filter((document) =>
      this.isUnreadFor(document, recipientIdentityId, readUntil),
    ).length;

    return [conversationId.valueOf(), unreadCount];
  }

  private async readMarkerMessageCreatedAt(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
  ): Promise<number | undefined> {
    const marker = await this.registry.findHead(
      this.readMarkerHeadKey(conversationId, recipientIdentityId),
    );
    const messageId = marker
      ? this.stringValue(marker, 'messageId')
      : undefined;

    if (!messageId) {
      return undefined;
    }

    const message = await this.findMessageDocumentById(
      conversationId,
      new MessageId(messageId),
    );

    return message?.createdAt;
  }

  private readMarkerHeadKey(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
  ): string {
    return `read-marker:${conversationId.valueOf()}:${recipientIdentityId.valueOf()}`;
  }

  private async findMessageDocumentById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<OrbitDBConversationMessageDocument | undefined> {
    return this.messageIndex.findById(conversationId, messageId);
  }

  private async findMessagesByConversationId(
    conversationId: ConversationId,
  ): Promise<Message[]> {
    return (await this.findMessageDocumentsByConversationId(conversationId))
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((document) => this.messageMapper.toDomain(document));
  }

  private isUnreadFor(
    document: OrbitDBConversationMessageDocument,
    recipientIdentityId: IdentityId,
    readUntilCreatedAt?: number,
  ): boolean {
    return (
      (document.type === MessageType.SENT.valueOf() ||
        document.type === MessageType.POLL.valueOf()) &&
      document.authorId !== recipientIdentityId.valueOf() &&
      (readUntilCreatedAt === undefined ||
        document.createdAt > readUntilCreatedAt)
    );
  }

  public async findById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const found = await this.findFolded(conversationId);

    return found
      ? this.conversationOf(
          found,
          await this.findMessagesByConversationId(conversationId),
        )
      : undefined;
  }

  public async findMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation | undefined> {
    const found = await this.findFolded(conversationId);

    return found ? this.conversationOf(found) : undefined;
  }

  public async findMetadataAtFrontier(
    conversationId: ConversationId,
    frontier: string[],
  ): Promise<Conversation | undefined> {
    const records = await this.operationIndex.findRecords(
      this.headKey(conversationId),
    );
    const { roster } = ConversationStateFold.fold(
      ConversationStateFold.closureOf(
        this.operationsOf(conversationId.valueOf(), records),
        frontier,
      ),
    );

    return roster ? this.conversationOf({ createdAt: 0, roster }) : undefined;
  }

  public async findCandidateMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    return this.findMessageById(conversationId, messageId);
  }

  public findByParticipant(
    participantId: IdentityId,
    limit: number,
    beforeConversationId?: ConversationId,
  ): Promise<Conversation[]> {
    const memberOf = this.cachedConversations().filter((found) =>
      found.roster.isMember(participantId.valueOf()),
    );
    const before = beforeConversationId
      ? memberOf.find(
          (found) => found.roster.getId() === beforeConversationId.valueOf(),
        )
      : undefined;

    return Promise.resolve(
      memberOf
        .filter((found) => (before ? found.createdAt < before.createdAt : true))
        .slice(0, limit)
        .map((found) => this.conversationOf(found)),
    );
  }

  public async findLatestMessages(
    conversationId: ConversationId,
    limit: number,
    beforeMessageId?: MessageId,
  ): Promise<Message[]> {
    const documents =
      await this.findMessageDocumentsByConversationId(conversationId);
    const beforeDocument = beforeMessageId
      ? documents.find((document) => document.id === beforeMessageId.valueOf())
      : undefined;

    return documents
      .filter((document) =>
        beforeDocument ? document.createdAt < beforeDocument.createdAt : true,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .reverse()
      .map((document) => this.messageMapper.toDomain(document));
  }

  public async findMessageById(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    const document = await this.findMessageDocumentById(
      conversationId,
      messageId,
    );

    return document ? this.messageMapper.toDomain(document) : undefined;
  }

  public async hasMessage(
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean> {
    return (
      (await this.findMessageDocumentById(conversationId, messageId)) !==
      undefined
    );
  }

  public async findMessagesAround(
    conversationId: ConversationId,
    messageId: MessageId,
    before: number,
    after: number,
  ): Promise<ConversationMessagesAround> {
    const documents = (
      await this.findMessageDocumentsByConversationId(conversationId)
    ).sort((left, right) => left.createdAt - right.createdAt);
    const targetIndex = documents.findIndex(
      (document) => document.id === messageId.valueOf(),
    );

    if (targetIndex === -1) {
      return new ConversationMessagesAround([]);
    }

    const start = Math.max(0, targetIndex - before);
    const end = Math.min(documents.length, targetIndex + after + 1);

    return new ConversationMessagesAround(
      documents
        .slice(start, end)
        .map((document) => this.messageMapper.toDomain(document)),
      documents[targetIndex + after + 1]?.id
        ? new MessageId(documents[targetIndex + after + 1].id)
        : undefined,
      documents[targetIndex - before - 1]?.id
        ? new MessageId(documents[targetIndex - before - 1].id)
        : undefined,
    );
  }

  public async findThreadMessages(
    conversationId: ConversationId,
    rootMessageId: MessageId,
    limit: number,
  ): Promise<Message[]> {
    const documents = (
      await this.findMessageDocumentsByConversationId(conversationId)
    ).filter(
      (document) => document.replyToMessageId === rootMessageId.valueOf(),
    );

    return this.deduplicateMessages(documents)
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, limit)
      .map((document) => this.messageMapper.toDomain(document));
  }

  public async countUnreadByRecipient(
    recipientIdentityId: IdentityId,
    conversationIds: ConversationId[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (conversationIds.length === 0) {
      return counts;
    }

    const unreadCounts = await Promise.all(
      conversationIds.map((conversationId) =>
        this.unreadCountForConversation(recipientIdentityId, conversationId),
      ),
    );

    for (const [conversationId, unreadCount] of unreadCounts) {
      if (unreadCount > 0) {
        counts.set(conversationId, unreadCount);
      }
    }

    return counts;
  }

  public async hasUnreadMessageForRecipient(
    recipientIdentityId: IdentityId,
    conversationId: ConversationId,
    messageId: MessageId,
  ): Promise<boolean> {
    const document = await this.findMessageDocumentById(
      conversationId,
      messageId,
    );

    if (!document) {
      return false;
    }

    return this.isUnreadFor(
      document,
      recipientIdentityId,
      await this.readMarkerMessageCreatedAt(
        conversationId,
        recipientIdentityId,
      ),
    );
  }

  public async findOneToOne(
    firstIdentityId: IdentityId,
    secondIdentityId: IdentityId,
    networkId: NetworkId,
  ): Promise<OneToOneConversation | undefined> {
    const conversation = await this.findById(
      ConversationId.deterministic(
        firstIdentityId,
        secondIdentityId,
        networkId,
      ),
    );

    return conversation instanceof OneToOneConversation
      ? conversation
      : undefined;
  }

  public async markReadUntil(
    conversationId: ConversationId,
    recipientIdentityId: IdentityId,
    messageId: MessageId,
    networkId?: NetworkId,
  ): Promise<void> {
    const externalMessageCreatedAt = this.messageCreatedAtFromExternalId(
      conversationId,
      messageId,
    );
    const message =
      externalMessageCreatedAt !== undefined
        ? undefined
        : await this.findMessageDocumentById(conversationId, messageId);
    const messageCreatedAt = externalMessageCreatedAt ?? message?.createdAt;

    if (messageCreatedAt === undefined) {
      return;
    }

    const markerNetworkId = await this.readMarkerNetworkId(
      conversationId,
      networkId,
    );

    const marker = {
      conversationId: conversationId.valueOf(),
      messageCreatedAt,
      messageId: messageId.valueOf(),
      networkId: markerNetworkId,
      readAt: Timestamp.now().valueOf(),
      recipientIdentityId: recipientIdentityId.valueOf(),
    };
    const markerNetworkIds = markerNetworkId ? [markerNetworkId] : [];
    const key = this.readMarkerHeadKey(conversationId, recipientIdentityId);

    this.registry.replicateHeadInBackground(key, marker, markerNetworkIds);
  }

  /**
   * Persists the new messages of a conversation. The conversation itself is
   * never written here: it exists only as signed operations, see
   * `saveOperation`.
   */
  public async save(
    conversation: Conversation,
    proofs: ReadonlyMap<string, PublicMutationProof> = new Map(),
  ): Promise<void> {
    const conversationId = conversation.getId();
    const existingMessageIds =
      await this.messageIndex.findStoredIds(conversationId);
    const newMessages = conversation
      .toPrimitives()
      .messages.filter((message) => !existingMessageIds.has(message.id));

    this.assertAllProofed(newMessages, proofs);

    for (const message of newMessages) {
      await this.putMessage(conversation, message.id, proofs);
    }
  }

  public async saveOperation(
    operation: ConversationOperation,
    proof: PublicMutationProof,
  ): Promise<void> {
    const payload = operation.toPrimitives();
    const document = PublicMutationRecord.withProof({ ...payload }, proof);
    const key = this.headKey(payload.conversationId);
    const records = await this.operationIndex.findRecords(key);

    PublicMutationRecord.assertNotStale(
      records.filter((stored) => stored.id === payload.id),
      document,
    );

    if (!operation.isGenesis()) {
      this.assertWithinQuota(payload.conversationId, records, operation);
    }
    await this.registry.putDocument('conversationOperations', document, [
      payload.networkId,
    ]);
    await this.operationIndex.putRecord(
      key,
      {
        conversationId: payload.conversationId,
        id: key,
        networkId: payload.networkId,
      },
      document,
      [payload.networkId],
      {
        recordFilter: (record) =>
          record.conversationId === payload.conversationId,
      },
    );
  }

  /** The operations nobody built on yet: the parents of the next operation. */
  public async findFrontier(conversationId: ConversationId): Promise<string[]> {
    return (await this.findState(conversationId))?.frontier ?? [];
  }

  /** Every stored operation of the conversation log, in no particular order. */
  public async findOperations(
    conversationId: ConversationId,
  ): Promise<ConversationOperation[]> {
    return this.operationsOf(
      conversationId.valueOf(),
      await this.operationIndex.findRecords(this.headKey(conversationId)),
    );
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    return Promise.resolve(0);
  }
}
