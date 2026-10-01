import DeviceAuthorizationFinder from '@app/contexts/identity-devices/application/find/DeviceAuthorizationFinder';
import { DeviceAuthorizationFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationFindMessage';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe(DeviceAuthorizationFinder.name, () => {
  const fixture = async (): Promise<{
    authorization: DeviceAuthorization;
    message: DeviceAuthorizationFindMessage;
    repository: ReturnType<typeof mock<DeviceAuthorizationRepository>>;
  }> => {
    const identity = await KeyPair.generate();
    const device = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    const identityId = new IdentityId(identity.toPrimitives().publicKey);
    const authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      DeviceCredential.fromString(device.toPrimitives().publicKey),
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );

    return {
      authorization,
      message: new DeviceAuthorizationFindMessage(identityId),
      repository: mock<DeviceAuthorizationRepository>(),
    };
  };

  it('returns the current authorization checkpoint', async () => {
    const { authorization, message, repository } = await fixture();
    repository.find.mockResolvedValue(authorization);

    const result = await new DeviceAuthorizationFinder(repository).find(
      message,
    );

    expect(repository.find).toHaveBeenCalledWith(message.identityId);
    expect(result).toBe(authorization);
  });

  it('rejects an identity without an authorization checkpoint', async () => {
    const { message, repository } = await fixture();
    repository.find.mockResolvedValue(undefined);

    await expect(
      new DeviceAuthorizationFinder(repository).find(message),
    ).rejects.toThrow(DeviceAuthorizationNotFoundError);
  });
});
