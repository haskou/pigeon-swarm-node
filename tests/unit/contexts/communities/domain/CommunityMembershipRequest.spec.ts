import { CommunityMembershipRequest } from '@app/contexts/communities/domain/CommunityMembershipRequest';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

describe('CommunityMembershipRequest', () => {
  const communityId = CommunityId.generate();
  const ownerIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const memberIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAMQ/tsR2Zc/+lWaGwtUAk2CUOjMyVw8hRlaxSzu9smrA=',
  );

  it('lets an invited identity accept an invitation', () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      memberIdentityId,
    );

    request.accept(memberIdentityId, ownerIdentityId);

    expect(request.toPrimitives().status).toBe('accepted');
  });

  it('lets the community owner accept a join request', () => {
    const request = CommunityMembershipRequest.request(
      communityId,
      memberIdentityId,
    );

    request.accept(ownerIdentityId, ownerIdentityId);

    expect(request.toPrimitives().status).toBe('accepted');
  });

  it('rejects resolving an already resolved request', () => {
    const request = CommunityMembershipRequest.request(
      communityId,
      memberIdentityId,
    );

    request.decline(memberIdentityId, ownerIdentityId);

    expect(() => request.accept(ownerIdentityId, ownerIdentityId)).toThrow(
      'Community membership request is already resolved',
    );
  });

  it('rejects accepting an invitation by a different identity', () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      memberIdentityId,
    );

    expect(() => request.accept(ownerIdentityId, ownerIdentityId)).toThrow(
      'Identity cannot resolve this community membership request',
    );
  });
});
