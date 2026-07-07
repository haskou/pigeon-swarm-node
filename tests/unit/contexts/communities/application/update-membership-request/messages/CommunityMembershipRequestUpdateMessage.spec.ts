import { InvalidCommunityRequestResolutionStatusError } from '@app/contexts/communities/domain/errors/InvalidCommunityRequestResolutionStatusError';
import { CommunityMembershipRequestUpdateMessage } from '@app/contexts/communities/application/update-membership-request/messages/CommunityMembershipRequestUpdateMessage';

describe('CommunityMembershipRequestUpdateMessage', () => {
  const identityId =
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
  const requestId = '507f1f77bcf86cd799439011';

  it('should expose accepted request resolutions', () => {
    const message = new CommunityMembershipRequestUpdateMessage(
      requestId,
      identityId,
      'accepted',
    );

    expect(message.isAccepted()).toBe(true);
    expect(message.isDeclined()).toBe(false);
  });

  it('should expose declined request resolutions', () => {
    const message = new CommunityMembershipRequestUpdateMessage(
      requestId,
      identityId,
      'declined',
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
        ),
    ).toThrow(InvalidCommunityRequestResolutionStatusError);
  });
});
