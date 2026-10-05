import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityMembershipRequestsFindMessage } from './messages/CommunityMembershipRequestsFindMessage';

export default class CommunityMembershipRequestsFinder {
  constructor(
    private readonly requestRepository: CommunityMembershipRequestRepository,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async find(
    message: CommunityMembershipRequestsFindMessage,
  ): Promise<CommunityMembershipRequest[]> {
    const [identityRequests, ownedCommunityRequests] = await Promise.all([
      this.requestRepository.findByIdentity(message.identityId),
      this.requestRepository.findByOwnedCommunities(message.identityId),
    ]);
    const requestsById = new Map(
      [...identityRequests, ...ownedCommunityRequests].map(
        (membershipRequest) => [
          membershipRequest.getId().valueOf(),
          membershipRequest,
        ],
      ),
    );

    const requests = [...requestsById.values()];
    const existence = await Promise.all(
      requests.map((membershipRequest) =>
        this.communityRepository.findById(membershipRequest.getCommunityId()),
      ),
    );

    return requests.filter((_, index) => existence[index] !== undefined);
  }
}
