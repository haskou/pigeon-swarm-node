import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityOperationParentsMissingError } from '@app/contexts/communities/domain/errors/CommunityOperationParentsMissingError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PublicMutationPendingError } from '@app/contexts/public-mutations/domain/errors/PublicMutationPendingError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PollScope } from '../../../domain/PollScope';

/** What an identity may do in the scope of a poll, as of the scope frontier the record carries. */
export default class PollMutationScopeAccess {
  private readonly communities = new ShortLivedLookup<Community | undefined>();

  constructor(private readonly communityRepository: CommunityRepository) {}

  private async loadCommunityAtFrontier(
    communityId: CommunityId,
    frontier: string[],
  ): Promise<Community | undefined> {
    try {
      return await this.communityRepository.requireAtFrontier(
        communityId,
        frontier,
      );
    } catch (error) {
      if (
        error instanceof CommunityNotFoundError ||
        error instanceof CommunityOperationParentsMissingError
      ) {
        return undefined;
      }

      throw error;
    }
  }

  private async assert(
    scope: PollScope,
    frontier: string[],
    identityId: string,
    action: 'manage' | 'vote',
  ): Promise<void> {
    const actor = new IdentityId(identityId);
    const communityId = scope.getCommunityId();
    const channelId = scope.getChannelId();
    const community = await this.communities.get(
      PublicMutationFrontier.keyOf(communityId.valueOf(), frontier),
      () => this.loadCommunityAtFrontier(communityId, frontier),
    );

    if (!community) throw new PublicMutationPendingError();

    if (action === 'manage') {
      community.authorizeTextChannelPollCreation(actor, channelId);
    } else {
      community.authorizeTextChannelPollVote(actor, channelId);
    }
  }

  /** Throws unless the identity may create or close polls in the scope. */
  public assertCanManage(
    scope: PollScope,
    frontier: string[],
    identityId: string,
  ): Promise<void> {
    return this.assert(scope, frontier, identityId, 'manage');
  }

  /** Throws unless the identity may vote in the scope. */
  public assertCanVote(
    scope: PollScope,
    frontier: string[],
    identityId: string,
  ): Promise<void> {
    return this.assert(scope, frontier, identityId, 'vote');
  }
}
