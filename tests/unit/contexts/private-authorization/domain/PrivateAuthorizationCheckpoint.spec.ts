import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';

describe('PrivateAuthorizationCheckpoint', () => {
  it('rejects an unbounded revoked-device history', () => {
    expect(() =>
      PrivateAuthorizationCheckpoint.fromPrimitives({
        admittedDeviceKeys: ['owner'],
        authorityKeys: ['owner'],
        controlCheckpointJson: '{}',
        deviceIdentities: [{ deviceKey: 'owner', identityId: 'identity' }],
        freshnessAuthorityKey: 'owner',
        headHash: 'head-1',
        parentHeadHash: 'head-0',
        revision: 1,
        revokedDeviceKeys: Array.from(
          { length: 129 },
          (_value, index) => `revoked-${index}`,
        ),
        scopeId: 'scope',
      }),
    ).toThrow(InvalidPrivateAuthorizationError);
  });
});
