import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunitiesDiscovery } from './CommunitiesDiscovery';
import { CommunitiesDiscoverMessage } from './messages/CommunitiesDiscoverMessage';

export default class CommunitiesDiscoverer {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly requestRepository: CommunityMembershipRequestRepository,
  ) {}

  public async discover(
    message: CommunitiesDiscoverMessage,
  ): Promise<CommunitiesDiscovery> {
    const [communities, membershipRequests] = await Promise.all([
      this.communityRepository.findDiscoverable({
        networkId: message.networkId,
        query: message.query,
      }),
      this.requestRepository.findByIdentity(message.identityId),
    ]);

    return new CommunitiesDiscovery(communities, membershipRequests);
  }
}
