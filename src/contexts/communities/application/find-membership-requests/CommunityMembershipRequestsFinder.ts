import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { PageSlice } from '../pagination/PageSlice';
import { CommunityMembershipRequestPosition } from './CommunityMembershipRequestPosition';
import { CommunityMembershipRequestsPage } from './CommunityMembershipRequestsPage';
import { CommunityMembershipRequestsFindMessage } from './messages/CommunityMembershipRequestsFindMessage';

export default class CommunityMembershipRequestsFinder {
  constructor(
    private readonly requestRepository: CommunityMembershipRequestRepository,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async find(
    message: CommunityMembershipRequestsFindMessage,
  ): Promise<CommunityMembershipRequestsPage> {
    const ownedCommunities = (
      await this.communityRepository.findByMember(message.identityId)
    ).filter((community) => community.isOwner(message.identityId));
    const [identityRequests, ownedCommunityRequests] = await Promise.all([
      this.requestRepository.findByIdentity(message.identityId),
      this.requestRepository.findByCommunities(
        ownedCommunities.map((community) => community.getId()),
      ),
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
        this.communityRepository.hasById(membershipRequest.getCommunityId()),
      ),
    );
    const visible = requests.filter((_, index) => existence[index]);

    return new CommunityMembershipRequestsPage(
      PageSlice.of<CommunityMembershipRequest>({
        after: message.after,
        items: visible,
        limit: message.limit,
        order: 'desc',
        position: (membershipRequest) =>
          CommunityMembershipRequestPosition.of(
            membershipRequest.toPrimitives().updatedAt,
            membershipRequest.getId().valueOf(),
          ),
      }),
    );
  }
}
