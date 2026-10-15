import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { GroupConversation } from '@app/contexts/conversations/domain/GroupConversation';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationLimits } from '@app/contexts/conversations/domain/operations/ConversationOperationLimits';
import { ConversationRoster } from '@app/contexts/conversations/domain/operations/ConversationRoster';
import { ConversationState } from '@app/contexts/conversations/domain/operations/ConversationState';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

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

  private readonly operationIndex: OrbitDBHeadIndex<Record<string, unknown>>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
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

  private conversationOf(found: FoldedConversation): Conversation {
    const { admins, creator, id, members, name, networkId, type } =
      found.roster.toPrimitives();
    const primitives = {
      adminIds: admins,
      creatorId: creator,
      id,
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

  public async hasById(conversationId: ConversationId): Promise<boolean> {
    return (await this.findFolded(conversationId)) !== undefined;
  }

  public async requireMetadataById(
    conversationId: ConversationId,
  ): Promise<Conversation> {
    const found = await this.findFolded(conversationId);

    if (!found) throw new ConversationNotFoundError(conversationId);

    return this.conversationOf(found);
  }

  public async requireMetadataAtFrontier(
    conversationId: ConversationId,
    frontier: string[],
  ): Promise<Conversation> {
    const records = await this.operationIndex.findRecords(
      this.headKey(conversationId),
    );
    const { roster } = ConversationStateFold.fold(
      ConversationStateFold.closureOf(
        this.operationsOf(conversationId.valueOf(), records),
        frontier,
      ),
    );

    if (!roster) throw new ConversationNotFoundError(conversationId);

    return this.conversationOf({ createdAt: 0, roster });
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

  public findOneToOneByParticipant(
    participantId: IdentityId,
    limit: number,
  ): Promise<Conversation[]> {
    return Promise.resolve(
      this.cachedConversations()
        .filter(
          (found) =>
            !found.roster.isGroup() &&
            found.roster.isMember(participantId.valueOf()),
        )
        .slice(0, limit)
        .map((found) => this.conversationOf(found)),
    );
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
}
