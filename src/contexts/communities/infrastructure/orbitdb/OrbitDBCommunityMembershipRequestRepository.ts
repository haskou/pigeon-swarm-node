import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityMembershipRequestDocument } from './documents/OrbitDBCommunityMembershipRequestDocument';
import OrbitDBCommunityMembershipRequestMapper from './mappers/OrbitDBCommunityMembershipRequestMapper';

export default class OrbitDBCommunityMembershipRequestRepository extends CommunityMembershipRequestRepository {
  private readonly requestIndex: OrbitDBHeadIndex<OrbitDBCommunityMembershipRequestDocument>;

  private readonly requestCache = new Map<
    string,
    OrbitDBCommunityMembershipRequestDocument
  >();

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMembershipRequestMapper,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.requestIndex = new OrbitDBHeadIndex(this.registry, {
      belongsToCanonicalIndex: (key, record) =>
        this.belongsToCanonicalIndex(key, record),
      canonicalStoreName: 'requests',
      collectionName: 'requests',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        this.isNewerOrEqualDocument(current, candidate),
    });
  }

  private isCommunityDocument(value: Record<string, unknown>): boolean {
    return (
      typeof value.id === 'string' && typeof value.ownerIdentityId === 'string'
    );
  }

  private belongsToCanonicalIndex(
    key: string,
    document: Record<string, unknown>,
  ): boolean {
    if (!this.isStoredDocument(document)) return false;
    const communityKey = this.communityIndexHeadKey(document.communityId);
    const identityKeys = [document.creatorIdentityId, document.identityId].map(
      (identityId) =>
        this.identityIndexHeadKey(identityId, document.communityId),
    );

    return key === communityKey || identityKeys.includes(key);
  }

  private hasNumberFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'number');
  }

  private hasStringFields(
    value: Record<string, unknown>,
    fields: string[],
  ): boolean {
    return fields.every((field) => typeof value[field] === 'string');
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityMembershipRequestDocument {
    return this.isStoredDocument(value) && value.deleted !== true;
  }

  private isStoredDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityMembershipRequestDocument {
    return (
      value.kind === 'community_membership_request' &&
      this.hasStringFields(value, [
        'communityId',
        'creatorIdentityId',
        'id',
        'identityId',
        'status',
        'type',
      ]) &&
      this.hasNumberFields(value, ['createdAt', 'updatedAt'])
    );
  }

  private headKey(id: CommunityRequestId | string): string {
    const value = id instanceof CommunityRequestId ? id.valueOf() : id;

    return `community-membership-request:${value}`;
  }

  private communityIndexHeadKey(communityId: CommunityId | string): string {
    const value =
      communityId instanceof CommunityId ? communityId.valueOf() : communityId;

    return `community-membership-request-community-index:${value}`;
  }

  private identityIndexHeadKey(
    identityId: IdentityId | string,
    communityId?: string,
  ): string {
    const value =
      identityId instanceof IdentityId ? identityId.valueOf() : identityId;
    const prefix = `community-membership-request-identity-index:${value}`;

    return communityId ? `${prefix}:${communityId}` : `${prefix}:`;
  }

  private freshness(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): number {
    return document.deletedAt ?? document.updatedAt;
  }

  private isNewerOrEqualDocument(
    current: OrbitDBCommunityMembershipRequestDocument,
    candidate: OrbitDBCommunityMembershipRequestDocument,
  ): boolean {
    const currentFreshness = this.freshness(current);
    const candidateFreshness = this.freshness(candidate);

    if (currentFreshness !== candidateFreshness) {
      return currentFreshness <= candidateFreshness;
    }

    return current.deleted !== true && candidate.deleted === true;
  }

  private putIndexRecord(
    key: string,
    document: OrbitDBCommunityMembershipRequestDocument,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    return this.requestIndex.putRecord(
      key,
      { ...attributes, id: key },
      document,
      [],
      {
        recordFilter: (candidate) =>
          candidate.communityId === document.communityId,
        replace: true,
      },
    );
  }

  private replicateHeadsInBackground(
    communityId: CommunityId,
    document: OrbitDBCommunityMembershipRequestDocument,
  ): void {
    this.registry.cacheHeadLocally(this.headKey(document.id), { ...document });
    this.publicStorageGuard.runInBackgroundWhilePublic(
      communityId,
      async () => {
        const communityKey = this.communityIndexHeadKey(document.communityId);
        await this.registry.putHeadExactly(this.headKey(document.id), {
          ...document,
        });
        await Promise.all([
          this.putIndexRecord(communityKey, document, {
            communityId: document.communityId,
          }),
          ...[
            ...new Set([document.creatorIdentityId, document.identityId]),
          ].map((identityId) =>
            this.putIndexRecord(
              this.identityIndexHeadKey(identityId, document.communityId),
              document,
              { identityId },
            ),
          ),
        ]);
      },
    );
  }

  private cachedStoredRequestDocuments(): OrbitDBCommunityMembershipRequestDocument[] {
    const registryDocuments = this.registry
      .findCachedHeadsByPrefix('community-membership-request:')
      .filter(
        (document): document is OrbitDBCommunityMembershipRequestDocument =>
          this.isStoredDocument(document),
      );

    registryDocuments.forEach((document) =>
      this.cacheRequestDocument(document),
    );

    return this.requestIndex
      .deduplicate([...this.requestCache.values(), ...registryDocuments])
      .filter((document) => this.isStoredDocument(document));
  }

  private cacheRequestDocument(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): void {
    this.requestCache.set(document.id, document);
  }

  private toDomain(
    documents: OrbitDBCommunityMembershipRequestDocument[],
  ): CommunityMembershipRequest[] {
    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = this.requestIndex.deduplicate([
        ...((await this.requestIndex.find(
          this.communityIndexHeadKey(communityId),
        )) ?? []),
        ...this.cachedStoredRequestDocuments().filter(
          (document) => document.communityId === communityId.valueOf(),
        ),
      ]);

      await Promise.all(
        documents
          .filter(
            (document) =>
              document.communityId === communityId.valueOf() &&
              this.isStoredDocument(document),
          )
          .map(async (document) => {
            const tombstone = {
              ...document,
              deleted: true,
              deletedAt: Date.now(),
            };

            await this.registry.putDocument('requests', tombstone);
            this.cacheRequestDocument(tombstone);
            this.replicateHeadsInBackground(communityId, tombstone);
          }),
      );
    });
  }

  public async findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    await this.publicStorageGuard.assertPublic(communityId);
    const indexedDocuments =
      (await this.requestIndex.find(this.communityIndexHeadKey(communityId))) ??
      [];
    const cachedDocuments = this.cachedStoredRequestDocuments();
    const documents = [...indexedDocuments, ...cachedDocuments].filter(
      (document) =>
        document.communityId === communityId.valueOf() &&
        new IdentityId(document.identityId).isEqual(identityId),
    );

    return this.toDomain(
      this.requestIndex
        .deduplicate(documents)
        .filter(
          (document): document is OrbitDBCommunityMembershipRequestDocument =>
            this.isDocument(document),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    );
  }

  public async findById(
    id: CommunityRequestId,
  ): Promise<CommunityMembershipRequest | undefined> {
    const head = await this.registry.findHead(this.headKey(id));
    const document = head && this.isDocument(head) ? head : undefined;

    if (!document) return undefined;
    await this.publicStorageGuard.assertPublic(
      new CommunityId(document.communityId),
    );

    return this.mapper.toDomain(document);
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const requests = this.toDomain(
      this.requestIndex
        .deduplicate([
          ...this.requestIndex.cachedByPrefix(
            this.identityIndexHeadKey(identityId),
          ),
          ...this.cachedStoredRequestDocuments().filter(
            (document) =>
              new IdentityId(document.identityId).isEqual(identityId) ||
              new IdentityId(document.creatorIdentityId).isEqual(identityId),
          ),
        ])
        .filter(
          (document): document is OrbitDBCommunityMembershipRequestDocument =>
            this.isDocument(document),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    );

    return this.publicStorageGuard.filterPublic(requests, (request) =>
      request.getCommunityId(),
    );
  }

  public async findByOwnedCommunities(
    ownerIdentityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const communities = this.registry
      .findCachedHeadsByPrefix('community:')
      .filter(
        (document) =>
          this.isCommunityDocument(document) &&
          new IdentityId(String(document.ownerIdentityId)).isEqual(
            ownerIdentityId,
          ),
      );
    const communityIds = new Set(
      communities
        .map((community) => community.id)
        .filter((id): id is string => typeof id === 'string'),
    );

    if (communityIds.size === 0) {
      return [];
    }

    const indexedDocuments = (
      await Promise.all(
        [...communityIds].map(
          async (communityId) =>
            (await this.requestIndex.find(
              this.communityIndexHeadKey(communityId),
            )) ?? [],
        ),
      )
    ).flat();
    const cachedDocuments = this.cachedStoredRequestDocuments().filter(
      (document) => communityIds.has(document.communityId),
    );

    const requests = this.toDomain(
      this.requestIndex
        .deduplicate([...indexedDocuments, ...cachedDocuments])
        .filter(
          (document): document is OrbitDBCommunityMembershipRequestDocument =>
            this.isDocument(document),
        ),
    );

    return this.publicStorageGuard.filterPublic(requests, (request) =>
      request.getCommunityId(),
    );
  }

  public async save(request: CommunityMembershipRequest): Promise<void> {
    const document = this.mapper.toDocument(request);
    await this.publicStorageGuard.runWhilePublic(
      new CommunityId(document.communityId),
      async () => {
        await this.registry.putDocument('requests', document);
        this.cacheRequestDocument(document);
        this.replicateHeadsInBackground(
          new CommunityId(document.communityId),
          document,
        );
      },
    );
  }
}
