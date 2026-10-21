import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';

import { Community } from '../../domain/Community';
import { CommunityInvitations } from '../../domain/entities/invitations/CommunityInvitations';
import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import { CommunityOperationParentsMissingError } from '../../domain/errors/CommunityOperationParentsMissingError';
import { InvalidCommunityOperationError } from '../../domain/errors/InvalidCommunityOperationError';
import { CommunityOperation } from '../../domain/operations/CommunityOperation';
import { CommunityOperationLimits } from '../../domain/operations/CommunityOperationLimits';
import { CommunityState } from '../../domain/operations/CommunityState';
import { CommunityStateFold } from '../../domain/operations/CommunityStateFold';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';

/**
 * Communities exist only as the signed operations replicated in the
 * `communityOperations` store. Every community read here is the deterministic
 * fold of those operations, so nothing a peer replicates can state a role, a
 * ban or a deletion that no authorized member signed.
 */
export default class OrbitDBCommunityRepository extends CommunityRepository {
  private static readonly HEAD_PREFIX = 'community-operation-index:';
  private static readonly MAX_FOLDED_COMMUNITIES = 2_048;
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

  private readonly folded = new Map<
    string,
    { signature: string; state: CommunityState }
  >();

  private readonly operationIndex: OrbitDBHeadIndex<Record<string, unknown>>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.operationIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'communityOperations',
      documentFromRecord: (record) => record,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
    this.registry.registerHeadRecordMerger(
      OrbitDBCommunityRepository.HEAD_PREFIX,
      (current, candidate) => this.mergeHeads(current, candidate),
    );
  }

  private headKey(communityId: CommunityId | string): string {
    return `${OrbitDBCommunityRepository.HEAD_PREFIX}${communityId.valueOf()}`;
  }

  /**
   * Replicas sign operations of one community concurrently, so two heads of
   * the same community are never superseded: their operations are unioned
   * and sorted, which makes every replica publish the same head.
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
      communityOperations: operations,
      updatedAt: Math.max(
        Number(current.updatedAt) || 0,
        Number(candidate.updatedAt) || 0,
      ),
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(
      OrbitDBCommunityRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  private operationsOf(
    communityId: string,
    records: Record<string, unknown>[],
  ): CommunityOperation[] {
    return records.flatMap((record) => {
      try {
        const operation = CommunityOperation.fromPrimitives(
          PublicMutationRecord.payloadOf(record),
        );

        return operation.getCommunityId().valueOf() === communityId
          ? [operation]
          : [];
      } catch {
        return [];
      }
    });
  }

  /** The state of one community, folded again only when its operations changed. */
  private stateOf(
    communityId: string,
    records: Record<string, unknown>[],
  ): CommunityState {
    const signature = records
      .map((record) => String(record.id))
      .sort()
      .join('\n');
    const known = this.folded.get(communityId);

    if (known?.signature === signature) return known.state;

    const state = CommunityStateFold.fold(
      this.operationsOf(communityId, records),
    );

    this.folded.delete(communityId);
    this.folded.set(communityId, { signature, state });

    if (this.folded.size > OrbitDBCommunityRepository.MAX_FOLDED_COMMUNITIES) {
      this.folded.delete(this.folded.keys().next().value as string);
    }

    return state;
  }

  private async findState(
    id: CommunityId,
  ): Promise<CommunityState | undefined> {
    const records = await this.operationIndex.findRecords(this.headKey(id));

    return records.length === 0
      ? undefined
      : this.stateOf(id.valueOf(), records);
  }

  /** Fails with the limit error a client can show, before the write is refused deeper down. */
  private assertWithinQuota(
    communityId: string,
    records: Record<string, unknown>[],
    operation: CommunityOperation,
  ): void {
    const author = operation.getAuthorIdentityId().valueOf();

    if (
      !CommunityOperationLimits.isAuthorQuotaReached(
        records.filter(
          (record) =>
            PublicMutationRecord.payloadOf(record).authorIdentityId === author,
        ).length,
      )
    ) {
      return;
    }

    CommunityOperationLimits.assertAuthorQuota(
      CommunityStateFold.closureOf(
        this.operationsOf(communityId, records),
        operation.getParents(),
      ),
      operation,
    );
  }

  /**
   * The fold of the causal past of `frontier`. Only a frontier hash not held
   * yet is missing parents (pending); an operation the fold refuses stays
   * refused.
   */
  private foldAtFrontier(
    operations: CommunityOperation[],
    frontier: string[],
  ): CommunityState {
    let closure: CommunityOperation[];

    try {
      closure = CommunityStateFold.closureOf(operations, frontier);
    } catch (error) {
      if (error instanceof InvalidCommunityOperationError) {
        throw new CommunityOperationParentsMissingError();
      }

      throw error;
    }

    return CommunityStateFold.fold(closure);
  }

  /** Every community whose operations are cached locally, newest first. */
  private cachedCommunities(): Community[] {
    return this.registry
      .findCachedHeadsByPrefix(OrbitDBCommunityRepository.HEAD_PREFIX)
      .flatMap((head) => {
        const communityId = head.communityId;

        if (typeof communityId !== 'string') return [];

        const state = this.stateOf(
          communityId,
          this.operationIndex.recordsFromHead(head),
        );

        return state.community && !state.deleted ? [state.community] : [];
      })
      .sort((left, right) => {
        const byCreation =
          right.toPrimitives().createdAt - left.toPrimitives().createdAt;

        return (
          byCreation ||
          left.getId().valueOf().localeCompare(right.getId().valueOf())
        );
      })
      .map((community) => this.copyOf(community));
  }

  /**
   * The cached communities once every community head this node already knew
   * (restored from its own head cache) and held back by the gate is admitted,
   * and no community head was dropped for want of room. Until then a held head
   * is missing from the cache, so the list is not ready: it must not answer a
   * partial or an empty list. A head a peer plants under a key this node never
   * had does not count: it is not part of the node's own list.
   */
  private caughtUpCachedCommunities(): Promise<Community[]> {
    if (
      this.registry.hasPendingRestoredHeadAdmissions(
        OrbitDBCommunityRepository.HEAD_PREFIX,
      )
    ) {
      return Promise.reject(new ReplicatedStateNotReadyError());
    }

    return Promise.resolve(this.cachedCommunities());
  }

  private copyOf(community: Community): Community {
    return Community.fromPrimitives(community.toPrimitives());
  }

  private activeCommunityOf(
    state: CommunityState | undefined,
  ): Community | undefined {
    return state?.community && !state.deleted ? state.community : undefined;
  }

  public async requireById(id: CommunityId): Promise<Community> {
    const community = this.activeCommunityOf(await this.findState(id));

    if (!community) throw new CommunityNotFoundError();

    return this.copyOf(community);
  }

  public async hasById(id: CommunityId): Promise<boolean> {
    return this.activeCommunityOf(await this.findState(id)) !== undefined;
  }

  /**
   * The state as it was at `frontier`: the fold of exactly the operations in
   * the causal past of those heads. A head this node does not hold yet makes
   * the lookup fail, so the record is retried once the operations replicated.
   */
  public async requireStateAtFrontier(
    id: CommunityId,
    frontier: string[],
  ): Promise<{ community: Community; invitations: CommunityInvitations }> {
    const records = await this.operationIndex.findRecords(this.headKey(id));
    const state = this.foldAtFrontier(
      this.operationsOf(id.valueOf(), records),
      frontier,
    );
    const community = this.activeCommunityOf(state);

    if (!community) throw new CommunityNotFoundError();

    return { community, invitations: state.invitations };
  }

  /** The community as it was at `frontier` (see `requireStateAtFrontier`). */
  public async requireAtFrontier(
    id: CommunityId,
    frontier: string[],
  ): Promise<Community> {
    return this.copyOf(
      (await this.requireStateAtFrontier(id, frontier)).community,
    );
  }

  /** The invitations of an active community; none for any other. */
  public async findInvitations(id: CommunityId): Promise<CommunityInvitations> {
    const state = await this.findState(id);

    return state && this.activeCommunityOf(state)
      ? state.invitations
      : CommunityInvitations.EMPTY;
  }

  /** The operations nobody built on yet: the parents of the next operation. */
  public async findFrontier(id: CommunityId): Promise<string[]> {
    return (await this.findState(id))?.frontier ?? [];
  }

  /**
   * Admitted operations sorted by code unit order of their digests. The page
   * is chosen by record id (`community:<id>:op:<digest>`) so only the records
   * it serves are decoded and hashed; the head is still read whole.
   */
  public async findOperations(
    id: CommunityId,
    after: string | undefined,
    limit: number,
  ): Promise<CommunityOperation[]> {
    const prefix = CommunityOperation.recordIdOf(id.valueOf(), '');
    const candidates = (await this.operationIndex.findRecords(this.headKey(id)))
      .filter(
        (record) =>
          typeof record.id === 'string' &&
          record.id.startsWith(prefix) &&
          (after === undefined || record.id.slice(prefix.length) > after),
      )
      .sort((left, right) => (String(left.id) < String(right.id) ? -1 : 1));
    const page: CommunityOperation[] = [];

    for (const record of candidates) {
      if (page.length === limit) break;

      page.push(
        ...this.operationsOf(id.valueOf(), [record]).filter(
          (operation) => operation.getId() === record.id,
        ),
      );
    }

    return page;
  }

  /**
   * The frontier of every community of `networkId` cached on this node,
   * deleted ones included, sorted by community id.
   */
  public findFrontiersByNetwork(
    networkId: string,
  ): Promise<Array<{ communityId: CommunityId; frontier: string[] }>> {
    return Promise.resolve(
      this.registry
        .findCachedHeadsByPrefix(OrbitDBCommunityRepository.HEAD_PREFIX)
        .flatMap((head) => {
          const communityId = head.communityId;

          if (
            head.networkId !== networkId ||
            typeof communityId !== 'string' ||
            communityId.length === 0
          ) {
            return [];
          }

          return [
            {
              communityId: new CommunityId(communityId),
              frontier: this.stateOf(
                communityId,
                this.operationIndex.recordsFromHead(head),
              ).frontier,
            },
          ];
        })
        .sort((left, right) =>
          left.communityId.valueOf().localeCompare(right.communityId.valueOf()),
        ),
    );
  }

  public async findDiscoverable(
    options: {
      networkId?: string;
      query?: string;
    },
    excludedIds: CommunityId[] = [],
  ): Promise<Community[]> {
    const query = options.query?.trim();
    const regex = query ? new RegExp(this.escapeRegex(query), 'i') : undefined;
    const excluded = new Set(excludedIds.map((id) => id.valueOf()));

    const communities = await this.caughtUpCachedCommunities();

    return communities.filter((community) => {
      const { description, discoverable, id, name, networkId } =
        community.toPrimitives();

      return (
        discoverable &&
        !excluded.has(id) &&
        (!options.networkId || networkId === options.networkId) &&
        (!regex || regex.test(name) || regex.test(description))
      );
    });
  }

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const communities = await this.caughtUpCachedCommunities();

    return communities.filter((community) => community.isMember(identityId));
  }

  public async save(
    operation: CommunityOperation,
    proof: PublicMutationProof,
  ): Promise<void> {
    const payload = operation.toPrimitives();
    const document = PublicMutationRecord.withProof({ ...payload }, proof);
    const key = this.headKey(payload.communityId);

    await this.publicStorageGuard.runWhilePublic(
      operation.getCommunityId(),
      async () => {
        const records = await this.operationIndex.findRecords(key);

        PublicMutationRecord.assertNotStale(
          records.filter((stored) => stored.id === payload.id),
          document,
        );

        if (!operation.isGenesis()) {
          this.assertWithinQuota(payload.communityId, records, operation);
        }
        await this.registry.putDocument('communityOperations', document, [
          payload.networkId,
        ]);
        await this.operationIndex.putRecord(
          key,
          {
            communityId: payload.communityId,
            id: key,
            networkId: payload.networkId,
          },
          document,
          [payload.networkId],
          {
            recordFilter: (record) =>
              record.communityId === payload.communityId,
          },
        );
      },
    );
  }
}
