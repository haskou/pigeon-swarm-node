import { assert } from '@haskou/value-objects';

import { CommunityInvitationClaim } from '../../domain/entities/invitations/CommunityInvitationClaim';
import { CommunityInvitationNotFoundError } from '../../domain/errors/CommunityInvitationNotFoundError';
import { CommunityInvitationUnusableError } from '../../domain/errors/CommunityInvitationUnusableError';
import CommunityInvitationClaimRepository from '../../domain/repositories/CommunityInvitationClaimRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInvitationClaimMessage } from './messages/CommunityInvitationClaimMessage';

/**
 * Stores the signed claim of a link holder, which asks a manager to admit
 * it. The claim policy checks it again at the frontier the claim names.
 */
export default class CommunityInvitationClaimer {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly claimRepository: CommunityInvitationClaimRepository,
  ) {}

  public async claim(
    message: CommunityInvitationClaimMessage,
  ): Promise<CommunityInvitationClaim> {
    const joiner = message.identityId;
    const community = await this.communityFinder.findById(message.communityId);
    const invitation = (
      await this.communityRepository.findInvitations(message.communityId)
    ).find(message.invitationId);

    assert(invitation !== undefined, new CommunityInvitationNotFoundError());
    assert(
      !community.isBanned(joiner) && !community.isMember(joiner),
      new CommunityInvitationUnusableError(),
    );
    invitation.assertAdmits(
      community,
      joiner,
      message.possession,
      message.consent,
    );

    const claim = CommunityInvitationClaim.create(
      message.communityId,
      message.invitationId,
      joiner,
      message.possession,
      message.consent,
    );

    await this.claimRepository.save(claim, message.proof);

    return claim;
  }
}
