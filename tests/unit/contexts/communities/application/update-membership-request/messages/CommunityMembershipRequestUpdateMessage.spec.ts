import { CommunityMembershipRequestUpdateMessage } from '@app/contexts/communities/application/update-membership-request/messages/CommunityMembershipRequestUpdateMessage';
import { InvalidCommunityRequestResolutionStatusError } from '@app/contexts/communities/domain/errors/InvalidCommunityRequestResolutionStatusError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { signedMutation } from '../../../../public-mutations/support/signedMutation';

describe('CommunityMembershipRequestUpdateMessage', () => {
  const identityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const requestId = '507f1f77bcf86cd799439011';
  let proof: PublicMutationProof;
  let moderationLog: { createdAt: number; mutation: unknown };

  beforeAll(async () => {
    proof = await signedMutation({
      identityId,
      kind: 'put',
      recordId: requestId,
      sequence: 1,
      store: 'requests',
    });
    moderationLog = {
      createdAt: 1780000000000,
      mutation: proof.toPrimitives(),
    };
  });

  it('should expose accepted request resolutions', () => {
    const message = new CommunityMembershipRequestUpdateMessage(
      requestId,
      identityId,
      'accepted',
      1780000000000,
      proof.toPrimitives(),
      moderationLog,
    );

    expect(message.isAccepted()).toBe(true);
    expect(message.isDeclined()).toBe(false);
  });

  it('should expose declined request resolutions', () => {
    const message = new CommunityMembershipRequestUpdateMessage(
      requestId,
      identityId,
      'declined',
      1780000000000,
      proof.toPrimitives(),
      moderationLog,
    );

    expect(message.isAccepted()).toBe(false);
    expect(message.isDeclined()).toBe(true);
  });

  it('should reject pending request status as a resolution', () => {
    expect(
      () =>
        new CommunityMembershipRequestUpdateMessage(
          requestId,
          identityId,
          'pending',
          1780000000000,
          proof.toPrimitives(),
          moderationLog,
        ),
    ).toThrow(InvalidCommunityRequestResolutionStatusError);
  });
});
