import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import OrbitDBCommunityMapper from './mappers/OrbitDBCommunityMapper';
import OrbitDBCommunityReplicaMerger from './OrbitDBCommunityReplicaMerger';
import OrbitDBCommunityReplicaProjection from './OrbitDBCommunityReplicaProjection';

export default class OrbitDBCommunityRepository extends CommunityRepository {
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
  private readonly aggregateBaselines = new WeakMap<
    Community,
    OrbitDBCommunityDocument
  >();

  private readonly communityIndex: OrbitDBHeadIndex<OrbitDBCommunityDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMapper,
    private readonly replicaMerger: OrbitDBCommunityReplicaMerger,
    private readonly projection: OrbitDBCommunityReplicaProjection,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.projection.register();
    this.communityIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'communities',
      documentFromRecord: (record) =>
        this.isStoredDocument(record) ? record : undefined,
      merge: (current, candidate) =>
        this.replicaMerger.merge(current, candidate),
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.isNewerOrEqualDocument(current, candidate),
    });
  }

  private escapeRegex(value: string): string {
    return value.replace(
      OrbitDBCommunityRepository.REGEX_SPECIAL_CHARACTERS,
      '\\$&',
    );
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityDocument {
    if (!this.isStoredDocument(value) || value.deleted === true) return false;

    try {
      return this.mapper.toDomain(value).getId().valueOf() === value.id;
    } catch {
      return false;
    }
  }

  private isStoredDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityDocument {
    return (
      this.hasStringFields(value, [
        'description',
        'id',
        'name',
        'networkId',
        'ownerIdentityId',
        'visibility',
      ]) &&
      typeof value.createdAt === 'number' &&
      this.isStringArray(value.memberIds) &&
      Array.isArray(value.textChannels)
    );
  }

  private communityHeadKey(communityId: string): string {
    return `community:${communityId}`;
  }

  private memberIndexHeadKey(identityId: string, communityId?: string): string {
    const prefix = `community-member-index:${identityId}`;

    return communityId ? `${prefix}:${communityId}` : `${prefix}:`;
  }

  private freshestDocumentsFirst(
    documents: OrbitDBCommunityDocument[],
  ): OrbitDBCommunityDocument[] {
    return this.communityIndex
      .deduplicate(documents)
      .sort((left, right) => this.freshness(right) - this.freshness(left));
  }

  private isNewerOrEqualDocument(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
  ): boolean {
    const currentFreshness = this.freshness(current);
    const candidateFreshness = this.freshness(candidate);

    if (currentFreshness !== candidateFreshness) {
      return currentFreshness <= candidateFreshness;
    }

    return current.deleted !== true || candidate.deleted === true;
  }

  private freshness(document: OrbitDBCommunityDocument): number {
    return Math.max(
      document.deletedAt ?? 0,
      document.updatedAt ?? 0,
      document.createdAt,
    );
  }

  private async findHead(
    id: CommunityId,
  ): Promise<Record<string, unknown> | undefined> {
    return this.registry.findHead(this.communityHeadKey(id.valueOf()));
  }

  private cachedCommunityDocuments(): OrbitDBCommunityDocument[] {
    return this.registry
      .findCachedHeadsByPrefix('community:')
      .filter((document): document is OrbitDBCommunityDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => this.freshness(right) - this.freshness(left));
  }

  private cachedStoredCommunityDocuments(): OrbitDBCommunityDocument[] {
    return this.registry
      .findCachedHeadsByPrefix('community:')
      .filter((document): document is OrbitDBCommunityDocument =>
        this.isStoredDocument(document),
      );
  }

  private putMemberIndex(
    memberId: string,
    document: OrbitDBCommunityDocument,
  ): Promise<void> {
    const key = this.memberIndexHeadKey(memberId, document.id);

    return this.communityIndex.putRecord(
      key,
      {
        id: key,
        identityId: memberId,
        memberId,
        networkId: document.networkId,
      },
      document,
      [document.networkId],
      {
        recordFilter: (candidate) =>
          candidate.id === document.id &&
          candidate.deleted !== true &&
          Array.isArray(candidate.memberIds) &&
          candidate.memberIds.includes(memberId),
        replace: true,
      },
    );
  }

  private putCommunityHead(document: OrbitDBCommunityDocument): Promise<void> {
    const key = this.communityHeadKey(document.id);
    this.registry.cacheHeadLocally(key, { ...document });

    return this.registry.putHeadExactly(
      key,
      {
        ...document,
      },
      [document.networkId],
    );
  }

  private async persist(document: OrbitDBCommunityDocument): Promise<void> {
    const current = this.registry.findCachedHead(
      this.communityHeadKey(document.id),
    );
    const memberIds = new Set([
      ...document.memberIds,
      ...(current && this.isStoredDocument(current) ? current.memberIds : []),
    ]);

    await this.publicStorageGuard.runWhilePublic(
      new CommunityId(document.id),
      async () => {
        await this.registry.putDocument('communities', document, [
          document.networkId,
        ]);
        await this.putCommunityHead(document);

        for (const memberId of memberIds) {
          await this.putMemberIndex(memberId, document);
        }
      },
    );
  }

  private toFreshDocument(community: Community): OrbitDBCommunityDocument {
    const head = this.registry.findCachedHead(
      this.communityHeadKey(community.getId().valueOf()),
    );

    const local = this.mapper.toDocument(community);
    const write = this.replicaMerger.prepareWrite(
      local,
      this.aggregateBaselines.get(community),
      head && this.isStoredDocument(head) ? head : undefined,
      Date.now(),
    );
    this.aggregateBaselines.set(
      community,
      structuredClone({ ...write.baseline, ...local }),
    );

    return write.document;
  }

  private toDomain(document: OrbitDBCommunityDocument): Community {
    const community = this.mapper.toDomain(document);
    this.aggregateBaselines.set(
      community,
      structuredClone({ ...document, ...this.mapper.toDocument(community) }),
    );

    return community;
  }

  public async delete(community: Community): Promise<void> {
    const head = this.registry.findCachedHead(
      this.communityHeadKey(community.getId().valueOf()),
    );
    const deletedDocument = this.replicaMerger.tombstone(
      this.mapper.toDocument(community),
      head && this.isStoredDocument(head) ? head : undefined,
      Date.now(),
    );

    await this.persist(deletedDocument);
  }

  public async findById(id: CommunityId): Promise<Community | undefined> {
    const head = await this.findHead(id);

    if (head) {
      return this.isDocument(head) ? this.toDomain(head) : undefined;
    }

    return undefined;
  }

  public async findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]> {
    const query = options.query?.trim();
    const regex = query ? new RegExp(this.escapeRegex(query), 'i') : undefined;
    const documents = this.cachedCommunityDocuments().filter((document) => {
      const isDiscoverable = document.discoverable ?? true;
      const networkMatches = options.networkId
        ? document.networkId === options.networkId
        : true;
      const queryMatches = regex
        ? regex.test(document.name) || regex.test(document.description)
        : true;

      return isDiscoverable && networkMatches && queryMatches;
    });

    return Promise.resolve(
      documents.slice(0, 50).map((document) => this.toDomain(document)),
    );
  }

  public findByMember(identityId: IdentityId): Promise<Community[]> {
    const indexedDocuments = this.communityIndex.cachedByPrefix(
      this.memberIndexHeadKey(identityId.valueOf()),
    );
    const documents = [
      ...indexedDocuments,
      ...this.cachedStoredCommunityDocuments(),
    ];

    return Promise.resolve(
      this.freshestDocumentsFirst(documents)
        .filter(
          (document) =>
            this.isDocument(document) &&
            document.memberIds.includes(identityId.valueOf()),
        )
        .map((document) => this.toDomain(document)),
    );
  }

  public async findSyncable(): Promise<Community[]> {
    return Promise.resolve(
      this.cachedCommunityDocuments().map((document) =>
        this.toDomain(document),
      ),
    );
  }

  public async save(community: Community): Promise<void> {
    const document = this.toFreshDocument(community);
    await this.persist(document);
  }
}
