import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Community } from '../../domain/Community';
import { CommunityOperation } from '../../domain/operations/CommunityOperation';
import { CommunityOperationPrimitives } from '../../domain/operations/CommunityOperationPrimitives';
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
  private static readonly MAX_DISCOVERABLE = 50;
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
  }

  private headKey(communityId: CommunityId | string): string {
    return `${OrbitDBCommunityRepository.HEAD_PREFIX}${communityId.valueOf()}`;
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
          PublicMutationRecord.payloadOf(
            record,
          ) as unknown as CommunityOperationPrimitives,
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

  private copyOf(community: Community): Community {
    return Community.fromPrimitives(community.toPrimitives());
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const state = await this.findState(id);

    return state?.community && !state.deleted
      ? this.copyOf(state.community)
      : undefined;
  }

  /** The operations nobody built on yet: the parents of the next operation. */
  public async findFrontier(id: CommunityId): Promise<string[]> {
    return (await this.findState(id))?.frontier ?? [];
  }

  public findDiscoverable(
    options: {
      networkId?: string;
      query?: string;
    },
    excludedIds: CommunityId[] = [],
  ): Promise<Community[]> {
    const query = options.query?.trim();
    const regex = query ? new RegExp(this.escapeRegex(query), 'i') : undefined;
    const excluded = new Set(excludedIds.map((id) => id.valueOf()));

    return Promise.resolve(
      this.cachedCommunities()
        .filter((community) => {
          const { description, discoverable, id, name, networkId } =
            community.toPrimitives();

          return (
            discoverable &&
            !excluded.has(id) &&
            (!options.networkId || networkId === options.networkId) &&
            (!regex || regex.test(name) || regex.test(description))
          );
        })
        .slice(0, OrbitDBCommunityRepository.MAX_DISCOVERABLE),
    );
  }

  public findByMember(identityId: IdentityId): Promise<Community[]> {
    return Promise.resolve(
      this.cachedCommunities().filter((community) =>
        community.isMember(identityId),
      ),
    );
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
        PublicMutationRecord.assertNotStale(
          (await this.operationIndex.findRecords(key)).filter(
            (stored) => stored.id === payload.id,
          ),
          document,
        );
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
            replace: true,
          },
        );
      },
    );
  }
}
