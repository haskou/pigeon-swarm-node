import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import PublicMutationVerifier, {
  PublicMutationExpectation,
} from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
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
    private readonly verifier: PublicMutationVerifier,
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

  /** Whether the joiner's device signed `document`, valid or not. */
  private async isGenuine(document: Record<string, unknown>): Promise<boolean> {
    const proof = PublicMutationRecord.proofOf(document);
    const payload = PublicMutationRecord.payloadOf(document);

    if (!proof) return false;

    try {
      await this.verifier.verify(proof, {
        ...this.expectationOf(payload),
        payload,
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Refuses a claim whose content differs from a claim its joiner already
   * signed under the same id. The gate hands policies the payload only, so
   * the same claim signed again passes; its proofs do not depend on the
   * frontier, so it changes nothing. A stored record its joiner did not sign
   * is ignored: anyone could plant one to block a claim.
   */
  private async assertFirstWrite(record: Record<string, unknown>) {
    const digest = PublicMutationProof.digestOf(record);
    // Claims of this very collection: `queryDocuments` would admit each of
    // them again through this policy and recurse.
    const stored = await this.registry.queryUnadmittedDocuments(
      this.collection,
      (document) =>
        document.scopeType === this.scopeType && document.id === record.id,
    );
    const others = stored.filter(
      (document) =>
        PublicMutationProof.digestOf(
          PublicMutationRecord.payloadOf(document),
        ) !== digest,
    );
    const genuine = await Promise.all(
      others.map((document) => this.isGenuine(document)),
    );

    if (genuine.includes(true)) throw new InvalidPublicMutationError();
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
