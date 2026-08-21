import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import OrbitDBCommunityMapper from './mappers/OrbitDBCommunityMapper';
import OrbitDBCommunitySectionMerger from './OrbitDBCommunitySectionMerger';

export default class OrbitDBCommunityRepository extends CommunityRepository {
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
  private readonly communityIndex: OrbitDBHeadIndex<OrbitDBCommunityDocument>;

  private readonly sectionMerger = new OrbitDBCommunitySectionMerger();

  private readonly aggregateBaselines = new Map<
    string,
    OrbitDBCommunityDocument
  >();

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMapper,
  ) {
    super();
    registry.registerHeadRecordMerger('community:', (current, candidate) =>
      this.mergeReplicaDocuments(current, candidate),
    );
    this.communityIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'communities',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
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
    return this.isStoredDocument(value) && value.deleted !== true;
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

  private memberIndexHeadKey(identityId: string): string {
    return `community-member-index:${identityId}`;
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

  private freshestStoredHead(
    communityId: string,
  ): OrbitDBCommunityDocument | undefined {
    const head = this.registry.findCachedHead(
      this.communityHeadKey(communityId),
    );

    return head && this.isStoredDocument(head) ? head : undefined;
  }

  private mergeReplicaDocuments(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.isStoredDocument(current) || !this.isStoredDocument(candidate)) {
      return candidate;
    }

    return this.sectionMerger.merge(current, candidate) as unknown as Record<
      string,
      unknown
    >;
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

  private replicateMemberIndexInBackground(
    identityId: string,
    community: OrbitDBCommunityDocument,
  ): void {
    const key = this.memberIndexHeadKey(identityId);

    void this.communityIndex.replicateRecordInBackground(
      key,
      {
        id: key,
        identityId,
        memberId: identityId,
        networkId: community.networkId,
      },
      community,
      [community.networkId],
    );
  }

  private replicateCommunityHeadInBackground(
    document: OrbitDBCommunityDocument,
  ): void {
    const key = this.communityHeadKey(document.id);
    this.registry.cacheHeadLocally(key, { ...document });
    this.registry.replicateHeadInBackground(
      key,
      {
        ...document,
      },
      [document.networkId],
      true,
    );
  }

  private replicateMemberIndexesInBackground(
    document: OrbitDBCommunityDocument,
  ): void {
    document.memberIds.forEach((memberId) =>
      this.replicateMemberIndexInBackground(memberId, document),
    );
  }

  private toFreshDocument(community: Community): OrbitDBCommunityDocument {
    const communityId = community.getId().valueOf();

    return this.sectionMerger.nextDocument(
      this.mapper.toDocument(community),
      this.aggregateBaselines.get(communityId),
      this.freshestStoredHead(communityId),
      Date.now(),
    );
  }

  private toDomain(document: OrbitDBCommunityDocument): Community {
    // Remembers the replicated state the aggregate was hydrated from so the
    // next write can tell untouched sections apart from edited ones.
    this.aggregateBaselines.set(document.id, { ...document });

    return this.mapper.toDomain(document);
  }

  public async delete(community: Community): Promise<void> {
    const communityId = community.getId().valueOf();
    const document = this.sectionMerger.tombstone(
      this.mapper.toDocument(community),
      this.freshestStoredHead(communityId),
      Date.now(),
    );

    this.aggregateBaselines.delete(communityId);

    const deletedDocument: OrbitDBCommunityDocument = {
      ...document,
    };

    await this.registry.replicateDocumentInBackground(
      'communities',
      deletedDocument,
      [deletedDocument.networkId],
    );
    this.replicateCommunityHeadInBackground(deletedDocument);
    this.replicateMemberIndexesInBackground(deletedDocument);
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

  public async findByMember(identityId: IdentityId): Promise<Community[]> {
    const indexedDocuments =
      (await this.communityIndex.find(
        this.memberIndexHeadKey(identityId.valueOf()),
      )) || [];
    const documents = [
      ...indexedDocuments,
      ...this.cachedStoredCommunityDocuments(),
    ];

    return this.freshestDocumentsFirst(documents)
      .filter(
        (document) =>
          this.isDocument(document) &&
          document.memberIds.includes(identityId.valueOf()),
      )
      .map((document) => this.toDomain(document));
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

    this.aggregateBaselines.set(document.id, { ...document });

    await this.registry.replicateDocumentInBackground('communities', document, [
      document.networkId,
    ]);
    this.replicateCommunityHeadInBackground(document);
    this.replicateMemberIndexesInBackground(document);
  }
}
