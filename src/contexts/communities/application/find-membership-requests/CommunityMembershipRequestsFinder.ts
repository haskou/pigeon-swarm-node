import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import { CommunityMembershipRequestsFindMessage } from './messages/CommunityMembershipRequestsFindMessage';

export default class CommunityMembershipRequestsFinder {
  constructor(
    private readonly requestRepository: CommunityMembershipRequestRepository,
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

    return [...requestsById.values()];
  }
}
