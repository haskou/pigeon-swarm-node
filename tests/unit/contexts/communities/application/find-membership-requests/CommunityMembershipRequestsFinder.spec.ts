import CommunityMembershipRequestsFinder from '@app/contexts/communities/application/find-membership-requests/CommunityMembershipRequestsFinder';
import { CommunityMembershipRequestsFindMessage } from '@app/contexts/communities/application/find-membership-requests/messages/CommunityMembershipRequestsFindMessage';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { mock } from 'jest-mock-extended';

describe('CommunityMembershipRequestsFinder', () => {
  const identityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';

  it('rejects instead of a partial list while a community head is held, reading no request', async () => {
    const requestRepository = mock<CommunityMembershipRequestRepository>();
    const communityRepository = mock<CommunityRepository>();
    communityRepository.findByMember.mockRejectedValue(
      new ReplicatedStateNotReadyError(),
    );

    await expect(
      new CommunityMembershipRequestsFinder(
        requestRepository,
        communityRepository,
      ).find(new CommunityMembershipRequestsFindMessage(identityId, 10)),
    ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);

    expect(requestRepository.findByIdentity).not.toHaveBeenCalled();
    expect(requestRepository.findByCommunities).not.toHaveBeenCalled();
    expect(communityRepository.hasById).not.toHaveBeenCalled();
  });
});
