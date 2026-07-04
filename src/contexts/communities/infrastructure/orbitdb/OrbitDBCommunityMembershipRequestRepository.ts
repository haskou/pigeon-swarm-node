import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

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
  ) {
    super();
    this.requestIndex = new OrbitDBHeadIndex(this.registry, {
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

  private identityIndexHeadKey(identityId: IdentityId | string): string {
    const value =
      identityId instanceof IdentityId ? identityId.valueOf() : identityId;

    return `community-membership-request-identity-index:${value}`;
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

  private async putIndex(
    key: string,
    document: OrbitDBCommunityMembershipRequestDocument,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    const requests = this.requestIndex
      .deduplicate([...((await this.requestIndex.find(key)) ?? []), document])
      .filter((candidate) => this.isDocument(candidate));

    await this.requestIndex.putDocuments(
      key,
      {
        ...attributes,
        id: key,
      },
      requests,
    );
  }

  private replicateHeadsInBackground(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): void {
    this.registry.replicateHeadInBackground(this.headKey(document.id), {
      ...document,
    });
    this.refreshIndexesInBackground(document);
  }

  private async putIndexes(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): Promise<void> {
    await this.putIndex(
      this.communityIndexHeadKey(document.communityId),
      document,
      {
        communityId: document.communityId,
      },
    );

    await Promise.all(
      [...new Set([document.creatorIdentityId, document.identityId])].map(
        (identityId) =>
          this.putIndex(this.identityIndexHeadKey(identityId), document, {
            identityId,
          }),
      ),
    );
  }

  private refreshIndexesInBackground(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): void {
    void this.putIndexes(document).catch((error) => {
      Kernel.logger.warn?.(
        `Community membership request indexes refresh failed: requestId=${document.id} error=${String(error)}`,
      );
    });
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
    const documents = this.requestIndex.deduplicate([
      ...((await this.requestIndex.find(
        this.communityIndexHeadKey(communityId),
      )) ?? []),
      ...this.cachedStoredRequestDocuments().filter(
        (document) => document.communityId === communityId.valueOf(),
      ),
    ]);

    await Promise.all(
      documents.map(async (document) => {
        const tombstone = {
          ...document,
          deleted: true,
          deletedAt: Date.now(),
        };

        await this.registry.putDocument('requests', tombstone);
        this.replicateHeadsInBackground(tombstone);
        this.cacheRequestDocument(tombstone);
      }),
    );
  }

  public async findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
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

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    return this.toDomain(
      this.requestIndex
        .deduplicate([
          ...((await this.requestIndex.find(
            this.identityIndexHeadKey(identityId),
          )) ?? []),
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

    return this.toDomain(
      this.requestIndex
        .deduplicate([...indexedDocuments, ...cachedDocuments])
        .filter(
          (document): document is OrbitDBCommunityMembershipRequestDocument =>
            this.isDocument(document),
        ),
    );
  }

  public async save(request: CommunityMembershipRequest): Promise<void> {
    const document = this.mapper.toDocument(request);

    await this.registry.putDocument('requests', document);
    this.replicateHeadsInBackground(document);
    this.cacheRequestDocument(document);
  }
}
