import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import OrbitDBCommunityMapper from './mappers/OrbitDBCommunityMapper';

export default class OrbitDBCommunityRepository extends CommunityRepository {
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
  private readonly communityIndex: OrbitDBHeadIndex<OrbitDBCommunityDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMapper,
  ) {
    super();
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
    const currentHead = this.registry.findCachedHead(
      this.communityHeadKey(community.getId().valueOf()),
    );
    const nextUpdatedAt =
      typeof currentHead?.updatedAt === 'number'
        ? currentHead.updatedAt + 1
        : 0;

    return {
      ...this.mapper.toDocument(community),
      updatedAt: Math.max(Date.now(), nextUpdatedAt),
    };
  }

  public async delete(community: Community): Promise<void> {
    const document = this.toFreshDocument(community);

    const deletedDocument = {
      ...document,
      deleted: true,
      deletedAt: Date.now(),
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
      return this.isDocument(head) ? this.mapper.toDomain(head) : undefined;
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
      documents.slice(0, 50).map((document) => this.mapper.toDomain(document)),
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
      .map((document) => this.mapper.toDomain(document));
  }

  public async findSyncable(): Promise<Community[]> {
    return Promise.resolve(
      this.cachedCommunityDocuments().map((document) =>
        this.mapper.toDomain(document),
      ),
    );
  }

  public async save(community: Community): Promise<void> {
    const document = this.toFreshDocument(community);

    await this.registry.replicateDocumentInBackground('communities', document, [
      document.networkId,
    ]);
    this.replicateCommunityHeadInBackground(document);
    this.replicateMemberIndexesInBackground(document);
  }
}
