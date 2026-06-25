import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityMembershipRequestDocument } from './documents/OrbitDBCommunityMembershipRequestDocument';
import OrbitDBCommunityMembershipRequestMapper from './mappers/OrbitDBCommunityMembershipRequestMapper';

export default class OrbitDBCommunityMembershipRequestRepository extends CommunityMembershipRequestRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMembershipRequestMapper,
  ) {
    super();
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityMembershipRequestDocument {
    return (
      value.kind === 'community_membership_request' &&
      value.deleted !== true &&
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

  private documentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBCommunityMembershipRequestDocument[] {
    const requests: unknown = record?.requests;

    if (!Array.isArray(requests)) {
      return [];
    }

    return (requests as unknown[])
      .filter(
        (document): document is OrbitDBCommunityMembershipRequestDocument =>
          this.isRecord(document) && this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private freshness(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): number {
    return document.deletedAt ?? document.updatedAt;
  }

  private deduplicateDocuments(
    documents: OrbitDBCommunityMembershipRequestDocument[],
  ): OrbitDBCommunityMembershipRequestDocument[] {
    const deduplicated = new Map<
      string,
      OrbitDBCommunityMembershipRequestDocument
    >();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || this.freshness(current) <= this.freshness(document)) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private async putIndex(
    key: string,
    document: OrbitDBCommunityMembershipRequestDocument,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
    const requests = this.deduplicateDocuments([
      ...indexedDocuments,
      document,
    ]).filter((candidate) => this.isDocument(candidate));

    await this.registry.putHead(key, {
      ...attributes,
      id: key,
      requests: requests.map((request) => ({ ...request })),
      updatedAt: Date.now(),
    });
  }

  private async putHeads(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): Promise<void> {
    await this.registry.putHead(this.headKey(document.id), { ...document });
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

  private toDomain(
    documents: OrbitDBCommunityMembershipRequestDocument[],
  ): CommunityMembershipRequest[] {
    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    const documents = this.documentsFromIndex(
      await this.registry.findHead(this.communityIndexHeadKey(communityId)),
    );

    await Promise.all(
      documents.map(async (document) => {
        const tombstone = {
          ...document,
          deleted: true,
          deletedAt: Date.now(),
        };

        await this.registry.putDocument('requests', tombstone);
        await this.putHeads(tombstone);
      }),
    );
  }

  public async findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const documents = this.documentsFromIndex(
      await this.registry.findHead(this.communityIndexHeadKey(communityId)),
    ).filter((document) =>
      new IdentityId(document.identityId).isEqual(identityId),
    );

    return this.toDomain(
      this.deduplicateDocuments(documents).sort(
        (left, right) => right.updatedAt - left.updatedAt,
      ),
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
      this.documentsFromIndex(
        await this.registry.findHead(this.identityIndexHeadKey(identityId)),
      ),
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

    const documents = (
      await Promise.all(
        [...communityIds].map((communityId) =>
          this.registry.findHead(this.communityIndexHeadKey(communityId)),
        ),
      )
    ).flatMap((record) => this.documentsFromIndex(record));

    return this.toDomain(this.deduplicateDocuments(documents));
  }

  public async save(request: CommunityMembershipRequest): Promise<void> {
    const document = this.mapper.toDocument(request);

    await this.registry.putDocument('requests', document);
    await this.putHeads(document);
  }
}
