import { PrivateAuthorizationStorageCapacityExceededError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationStorageCapacityExceededError';
import { PrivateAuthorizationProvisioningQuota } from '@app/contexts/private-authorization/domain/PrivateAuthorizationProvisioningQuota';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Integer } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';

describe('PrivateAuthorizationProvisioningQuota', () => {
  const identity = () =>
    new IdentityId(
      generateKeyPairSync('ed25519')
        .publicKey.export({
          format: 'der',
          type: 'spki',
        })
        .toString('base64'),
    );

  it('reserves bounded capacity per owner while preserving other owners', () => {
    const owner = identity();
    const otherOwner = identity();
    const quota = new PrivateAuthorizationProvisioningQuota(
      Array.from({ length: 16 }, () => ({
        ownerIdentityId: owner.valueOf(),
        provisionedBytes: 1,
      })),
    );

    expect(() => quota.reserve(owner, new Integer(1))).toThrow(
      PrivateAuthorizationStorageCapacityExceededError,
    );
    expect(quota.reserve(otherOwner, new Integer(1))).toEqual({
      ownerIdentityId: otherOwner.valueOf(),
      provisionedBytes: 1,
    });
  });

  it('bounds total provisioned bytes for the node', () => {
    const quota = new PrivateAuthorizationProvisioningQuota([
      {
        ownerIdentityId: identity().valueOf(),
        provisionedBytes: 256 * 1024 * 1024,
      },
    ]);

    expect(() => quota.reserve(identity(), new Integer(1))).toThrow(
      PrivateAuthorizationStorageCapacityExceededError,
    );
  });
});
