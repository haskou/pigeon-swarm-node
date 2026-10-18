import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityOperationsPage } from './CommunityOperationsPage';
import { CommunityOperationsFindMessage } from './messages/CommunityOperationsFindMessage';

/**
 * Serves the signed operations of a community to its members, so they verify
 * every author and replay the roles back to the creator themselves.
 */
export default class CommunityOperationsFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async find(
    message: CommunityOperationsFindMessage,
  ): Promise<CommunityOperationsPage> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewAsMember(message.actorIdentityId);

    return new CommunityOperationsPage(
      community.getId(),
      community.getNetworkId(),
      await this.communityRepository.findOperations(
        community.getId(),
        message.after,
        message.limit,
      ),
      message.limit,
    );
  }
}
