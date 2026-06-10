import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBCommunityMembershipRequestDocument } from './documents/OrbitDBCommunityMembershipRequestDocument';
import OrbitDBCommunityMembershipRequestMapper from './mappers/OrbitDBCommunityMembershipRequestMapper';

// eslint-disable-next-line max-len
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

  private async findDocuments(
    matcher: (document: OrbitDBCommunityMembershipRequestDocument) => boolean,
  ): Promise<OrbitDBCommunityMembershipRequestDocument[]> {
    const documents = await this.registry.queryDocuments(
      'requests',
      (document) => this.isDocument(document) && matcher(document),
    );

    return documents
      .filter(
        (document): document is OrbitDBCommunityMembershipRequestDocument =>
          this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private toDomain(
    documents: OrbitDBCommunityMembershipRequestDocument[],
  ): CommunityMembershipRequest[] {
    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async deleteByCommunity(communityId: CommunityId): Promise<void> {
    const documents = await this.findDocuments((document) =>
      new CommunityId(document.communityId).isEqual(communityId),
    );

    await Promise.all(
      documents.map((document) =>
        this.registry.putDocument('requests', {
          ...document,
          deleted: true,
          deletedAt: Date.now(),
        }),
      ),
    );
  }

  public async findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    return this.toDomain(
      await this.findDocuments(
        (document) =>
          new CommunityId(document.communityId).isEqual(communityId) &&
          new IdentityId(document.identityId).isEqual(identityId),
      ),
    );
  }

  public async findById(
    id: CommunityRequestId,
  ): Promise<CommunityMembershipRequest | undefined> {
    const [document] = await this.findDocuments((candidate) =>
      new CommunityRequestId(candidate.id).isEqual(id),
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    return this.toDomain(
      await this.findDocuments(
        (document) =>
          new IdentityId(document.creatorIdentityId).isEqual(identityId) ||
          new IdentityId(document.identityId).isEqual(identityId),
      ),
    );
  }

  public async findByOwnedCommunities(
    ownerIdentityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const communities = await this.registry.queryDocuments(
      'communities',
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

    return this.toDomain(
      await this.findDocuments((document) =>
        communityIds.has(document.communityId),
      ),
    );
  }

  public async save(request: CommunityMembershipRequest): Promise<void> {
    await this.registry.putDocument(
      'requests',
      this.mapper.toDocument(request),
    );
  }
}
