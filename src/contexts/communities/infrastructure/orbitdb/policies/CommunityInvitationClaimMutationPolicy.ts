import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Community } from '../../../domain/Community';
import { CommunityInvitationClaim } from '../../../domain/entities/invitations/CommunityInvitationClaim';
import { CommunityInvitations } from '../../../domain/entities/invitations/CommunityInvitations';
import { CommunityNotFoundError } from '../../../domain/errors/CommunityNotFoundError';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import OrbitDBCommunityRepository from '../OrbitDBCommunityRepository';

type CommunityInvitationState = {
  community: Community;
  invitations: CommunityInvitations;
};

/**
 * Admits a claim only while it could be admitted: its invitation is live at
 * the claim's frontier, the proofs verify and the joiner is neither banned
 * nor a member. The window is not checked: an admission checks it. A claim is
 * written once.
 */
export default class CommunityInvitationClaimMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    [
      'communityId',
      'consent',
      'id',
      'identityId',
      'invitationId',
      'possession',
    ],
    [],
    'community_invitation_claim',
  );

  private readonly states = new ShortLivedLookup<CommunityInvitationState>();

  public readonly collection = 'requests';

  public readonly scopeType = 'community_invitation_claim';

  public readonly requiresFrontier = true;

  constructor(
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
    private readonly registry: OrbitDBReplicatedStateRegistry,
  ) {
    super();
  }

  private async findState(
    communityId: string,
    frontier: string[],
  ): Promise<CommunityInvitationState> {
    return this.states
      .get(PublicMutationFrontier.keyOf(communityId, frontier), () =>
        this.communityRepository.requireStateAtFrontier(
          new CommunityId(communityId),
          frontier,
        ),
      )
      .catch((error: unknown) => {
        if (error instanceof CommunityNotFoundError) {
          throw new InvalidPublicMutationError();
        }

        throw error;
      });
  }

  /**
   * Refuses a second claim under the same id. The stored claim itself is
   * admitted again on every read, so a record with its very proof passes.
   */
  private async assertFirstWrite(record: Record<string, unknown>) {
    const digest = PublicMutationRecord.proofOf(record)?.digest();
    // Claims of this very collection: `queryDocuments` would admit each of
    // them again through this policy and recurse.
    const stored = await this.registry.queryUnadmittedDocuments(
      this.collection,
      (document) =>
        document.scopeType === this.scopeType && document.id === record.id,
    );

    if (
      stored.some(
        (document) =>
          PublicMutationRecord.proofOf(document)?.digest() !== digest,
      )
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const identityId = record.identityId as string;
    let joiner: IdentityId;

    try {
      joiner = new IdentityId(identityId);
    } catch {
      throw new InvalidPublicMutationError();
    }

    if (
      !joiner.isCanonicalKey() ||
      record.id !==
        CommunityInvitationClaim.idOf(record.invitationId as string, joiner)
    ) {
      throw new InvalidPublicMutationError();
    }

    return {
      authorIdentityId: identityId,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    if (isDeletion || authorIdentityId !== record.identityId) {
      throw new InvalidPublicMutationError();
    }

    await this.assertFirstWrite(record);

    const { community, invitations } = await this.findState(
      record.communityId as string,
      frontier,
    );
    const invitation = invitations.find(record.invitationId as string);
    const joiner = new IdentityId(authorIdentityId);

    if (
      !invitation ||
      community.isBanned(joiner) ||
      community.isMember(joiner)
    ) {
      throw new InvalidPublicMutationError();
    }

    try {
      invitation.assertAdmits(
        community,
        joiner,
        record.possession as string,
        record.consent as string,
      );
    } catch {
      throw new InvalidPublicMutationError();
    }
  }
}
