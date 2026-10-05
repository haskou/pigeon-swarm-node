import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('CommunityMembershipRequest', () => {
  const at = new Timestamp(1780000000000);
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
      at,
    );

    request.accept(memberIdentityId, ownerIdentityId, at);

    expect(request.toPrimitives().status).toBe('accepted');
  });

  it('lets the community owner accept a join request', () => {
    const request = CommunityMembershipRequest.request(
      communityId,
      memberIdentityId,
      at,
    );

    request.accept(ownerIdentityId, ownerIdentityId, at);

    expect(request.toPrimitives().status).toBe('accepted');
  });

  it('rejects resolving an already resolved request', () => {
    const request = CommunityMembershipRequest.request(
      communityId,
      memberIdentityId,
      at,
    );

    request.decline(memberIdentityId, ownerIdentityId, at);

    expect(() => request.accept(ownerIdentityId, ownerIdentityId, at)).toThrow(
      'Community membership request is already resolved',
    );
  });

  it('rejects accepting an invitation by a different identity', () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      memberIdentityId,
      at,
    );

    expect(() => request.accept(ownerIdentityId, ownerIdentityId, at)).toThrow(
      'Identity cannot resolve this community membership request',
    );
  });
});
