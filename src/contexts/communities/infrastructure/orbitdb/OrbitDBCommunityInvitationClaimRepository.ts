import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';
import { CommunityInvitationAlreadyClaimedError } from '@app/contexts/communities/domain/errors/CommunityInvitationAlreadyClaimedError';
import CommunityInvitationClaimRepository from '@app/contexts/communities/domain/repositories/CommunityInvitationClaimRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import PrivateCommunityPublicStorageGuard from '../PrivateCommunityPublicStorageGuard';
import { OrbitDBCommunityInvitationClaimDocument } from './documents/OrbitDBCommunityInvitationClaimDocument';

const CLAIM_FIELDS = [
  'communityId',
  'consent',
  'id',
  'identityId',
  'invitationId',
  'possession',
];

/**
 * Claims live in the `requests` store, indexed per community so that the
 * managers' listing never scans. The `community_invitation_claim` policy
 * admits each of them, here and on every node that replicates it.
 */
export default class OrbitDBCommunityInvitationClaimRepository extends CommunityInvitationClaimRepository {
  private readonly claimIndex: OrbitDBHeadIndex<OrbitDBCommunityInvitationClaimDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly publicStorageGuard: PrivateCommunityPublicStorageGuard,
  ) {
    super();
    this.claimIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'requests',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBCommunityInvitationClaimDocument {
    if (
      value.scopeType !== 'community_invitation_claim' ||
      !CLAIM_FIELDS.every((field) => typeof value[field] === 'string')
    ) {
      return false;
    }

    try {
      CommunityInvitationClaim.fromPrimitives(
        value as OrbitDBCommunityInvitationClaimDocument,
      );

      return true;
    } catch {
      return false;
    }
  }

  private headKey(id: string): string {
    return `community-invitation-claim:${id}`;
  }

  private communityIndexHeadKey(communityId: CommunityId): string {
    return `community-invitation-claim-community-index:${communityId.valueOf()}`;
  }

  private putIndexRecord(
    key: string,
    document: Record<string, unknown>,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    return this.claimIndex.putRecord(
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

  public async findByCommunity(
    communityId: CommunityId,
  ): Promise<CommunityInvitationClaim[]> {
    return this.publicStorageGuard.runWhilePublic(communityId, async () =>
      this.claimIndex
        .deduplicate(
          (await this.claimIndex.find(
            this.communityIndexHeadKey(communityId),
          )) ?? [],
        )
        .filter(
          (document) =>
            this.isDocument(document) &&
            document.communityId === communityId.valueOf(),
        )
        .map((document) => CommunityInvitationClaim.fromPrimitives(document)),
    );
  }

  public async save(
    claim: CommunityInvitationClaim,
    proof: PublicMutationProof,
  ): Promise<void> {
    const payload = {
      ...claim.toPrimitives(),
      scopeType: 'community_invitation_claim',
    };
    const document = PublicMutationRecord.withProof(payload, proof);
    const communityId = claim.getCommunityId();

    await this.publicStorageGuard.runWhilePublic(communityId, async () => {
      const stored = (
        await this.claimIndex.findRecords(this.headKey(payload.id))
      ).filter((record) => record.id === payload.id);

      if (stored.length > 0) throw new CommunityInvitationAlreadyClaimedError();

      await this.registry.putDocument('requests', document);
      await this.putIndexRecord(this.headKey(payload.id), document, {});
      await this.putIndexRecord(
        this.communityIndexHeadKey(communityId),
        document,
        { communityId: payload.communityId },
      );
    });
  }
}
