import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import DeviceAuthorizationAccessPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationAccessPolicy';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe(DeviceAuthorizationAccessPolicy.name, () => {
  const repository = mock<DeviceAuthorizationRepository>();
  const policy = new DeviceAuthorizationAccessPolicy(repository);
  let identityId: IdentityId;
  let credential: DeviceCredential;
  let authorization: DeviceAuthorization;

  beforeEach(async () => {
    jest.clearAllMocks();
    const identity = await KeyPair.generate();
    const device = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    identityId = new IdentityId(identity.toPrimitives().publicKey);
    credential = DeviceCredential.fromString(device.toPrimitives().publicKey);
    authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      credential,
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );
    repository.find.mockResolvedValue(authorization);
  });

  it('accepts a credential at the current authorization revision', async () => {
    await expect(
      policy.assertAuthorized(
        identityId,
        credential,
        DeviceAuthorizationRevision.initial(),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects stale revisions and unauthorized credentials', async () => {
    const unauthorized = await KeyPair.generate();

    await expect(
      policy.assertAuthorized(
        identityId,
        credential,
        new DeviceAuthorizationRevision(1),
      ),
    ).rejects.toThrow(InvalidDeviceAuthorizationTransitionError);
    await expect(
      policy.assertAuthorized(
        identityId,
        DeviceCredential.fromString(unauthorized.toPrimitives().publicKey),
        DeviceAuthorizationRevision.initial(),
      ),
    ).rejects.toThrow(InvalidDeviceAuthorizationTransitionError);
  });
});
