import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityMembershipRequestDocument } from './documents/OrbitDBCommunityMembershipRequestDocument';
import OrbitDBCommunityMembershipRequestMapper from './mappers/OrbitDBCommunityMembershipRequestMapper';

export default class OrbitDBCommunityMembershipRequestRepository extends CommunityMembershipRequestRepository {
  private readonly requestIndex: OrbitDBHeadIndex<OrbitDBCommunityMembershipRequestDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBCommunityMembershipRequestMapper,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.requestIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'requests',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private isCommunityDocument(value: Record<string, unknown>): boolean {
    return (
      typeof value.id === 'string' && typeof value.ownerIdentityId === 'string'
    );
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityMembershipRequestDocument {
    const strings = [
      'communityId',
      'creatorIdentityId',
      'id',
      'identityId',
      'status',
      'type',
    ];

    if (
      value.scopeType !== 'community_membership_request' ||
      !strings.every((field) => typeof value[field] === 'string') ||
      typeof value.createdAt !== 'number' ||
      typeof value.updatedAt !== 'number'
    ) {
      return false;
    }

    try {
      this.mapper.toDomain(value as OrbitDBCommunityMembershipRequestDocument);

      return true;
    } catch {
      return false;
    }
  }

  private headKey(id: CommunityRequestId | string): string {
    return `community-membership-request:${id.valueOf()}`;
  }

  private communityIndexHeadKey(communityId: CommunityId | string): string {
    return `community-membership-request-community-index:${communityId.valueOf()}`;
  }

  private identityIndexHeadKey(
    identityId: IdentityId | string,
    communityId?: string,
  ): string {
    const prefix = `community-membership-request-identity-index:${identityId.valueOf()}`;

    return communityId ? `${prefix}:${communityId}` : `${prefix}:`;
  }

  private newestFirst(
    documents: Record<string, unknown>[],
  ): OrbitDBCommunityMembershipRequestDocument[] {
    return this.requestIndex
      .deduplicate(documents as OrbitDBCommunityMembershipRequestDocument[])
      .filter((document) => this.isDocument(document))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private putIndexRecord(
    key: string,
    document: Record<string, unknown>,
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

  public async findByCommunityAndIdentity(
    communityId: CommunityId,
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const documents = (
        (await this.requestIndex.find(
          this.communityIndexHeadKey(communityId),
        )) ?? []
      ).filter((document) => document.identityId === identityId.valueOf());

      return this.newestFirst(documents).map((document) =>
        this.mapper.toDomain(document),
      );
    });
  }

  public async findById(
    id: CommunityRequestId,
  ): Promise<CommunityMembershipRequest | undefined> {
    const [document] = this.newestFirst(
      (await this.requestIndex.find(this.headKey(id))) ?? [],
    );

    if (!document) return undefined;

    return this.publicStorageGuard.runWhilePublic(
      new CommunityId(document.communityId),
      () => Promise.resolve(this.mapper.toDomain(document)),
    );
  }

  public async findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const requests = this.newestFirst(
      this.requestIndex.cachedByPrefix(this.identityIndexHeadKey(identityId)),
    ).map((document) => this.mapper.toDomain(document));

    return this.publicStorageGuard.filterPublic(requests, (request) =>
      request.getCommunityId(),
    );
  }

  public async findByOwnedCommunities(
    ownerIdentityId: IdentityId,
  ): Promise<CommunityMembershipRequest[]> {
    const communityIds = new Set(
      this.registry
        .findCachedHeadsByPrefix('community:')
        .filter(
          (document) =>
            this.isCommunityDocument(document) &&
            new IdentityId(String(document.ownerIdentityId)).isEqual(
              ownerIdentityId,
            ),
        )
        .map((community) => community.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const documents = (
      await Promise.all(
        [...communityIds].map(
          async (communityId) =>
            (await this.requestIndex.find(
              this.communityIndexHeadKey(communityId),
            )) ?? [],
        ),
      )
    ).flat();
    const requests = this.newestFirst(documents).map((document) =>
      this.mapper.toDomain(document),
    );

    return this.publicStorageGuard.filterPublic(requests, (request) =>
      request.getCommunityId(),
    );
  }

  public async save(
    request: CommunityMembershipRequest,
    proof: PublicMutationProof,
  ): Promise<void> {
    const payload = this.mapper.toPayload(request);
    const document = PublicMutationRecord.withProof(payload, proof);
    const communityId = new CommunityId(payload.communityId);

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      PublicMutationRecord.assertNotStale(
        (await this.requestIndex.findRecords(this.headKey(payload.id))).filter(
          (stored) => stored.id === payload.id,
        ),
        document,
      );
      await this.registry.putDocument('requests', document);
      await this.putIndexRecord(this.headKey(payload.id), document, {});
      await this.putIndexRecord(
        this.communityIndexHeadKey(communityId),
        document,
        { communityId: payload.communityId },
      );

      const identities = new Set([
        payload.identityId,
        payload.creatorIdentityId,
      ]);

      await Promise.all(
        [...identities].map((identityId) =>
          this.putIndexRecord(
            this.identityIndexHeadKey(identityId, payload.communityId),
            document,
            { communityId: payload.communityId, identityId },
          ),
        ),
      );
    });
  }
}
