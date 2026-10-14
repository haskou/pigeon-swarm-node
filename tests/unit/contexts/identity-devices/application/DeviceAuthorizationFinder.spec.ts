import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import DeviceAuthorizationFinder from '@app/contexts/identity-devices/application/find/DeviceAuthorizationFinder';
import { DeviceAuthorizationFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationFindMessage';
import { DeviceAuthorizationTransitionLogFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationTransitionLogFindMessage';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransitionDisclosure } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionDisclosure';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
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
    repository.require.mockResolvedValue(authorization);

    const result = await new DeviceAuthorizationFinder(repository).find(
      message,
    );

    expect(repository.require).toHaveBeenCalledWith(message.identityId);
    expect(result).toBe(authorization);
  });

  it('rejects an identity without an authorization checkpoint', async () => {
    const { message, repository } = await fixture();
    repository.require.mockRejectedValue(
      new DeviceAuthorizationNotFoundError(),
    );

    await expect(
      new DeviceAuthorizationFinder(repository).find(message),
    ).rejects.toThrow(DeviceAuthorizationNotFoundError);
  });

  it('discloses the transition log to its reader after a revision', async () => {
    const { authorization, repository } = await fixture();
    const log = mock<DeviceAuthorizationTransitionLog>();
    const disclosure = mock<DeviceAuthorizationTransitionDisclosure>();
    const disclosedAfter = mock<DeviceAuthorizationTransitionDisclosure>();
    const message = new DeviceAuthorizationTransitionLogFindMessage(
      authorization.getIdentityId(),
      authorization.getRecoveryAuthority(),
      new DeviceAuthorizationRevision(2),
    );
    log.disclosedTo.mockReturnValue(disclosure);
    disclosure.after.mockReturnValue(disclosedAfter);
    repository.requireTransitionLog.mockResolvedValue(log);

    const result = await new DeviceAuthorizationFinder(
      repository,
    ).findTransitionLog(message);

    expect(repository.requireTransitionLog).toHaveBeenCalledWith(
      message.identityId,
    );
    expect(log.disclosedTo).toHaveBeenCalledWith(message.reader);
    expect(disclosure.after).toHaveBeenCalledWith(message.after);
    expect(result).toBe(disclosedAfter);
  });

  it('rejects a transition log read for an identity without authorization', async () => {
    const { authorization, repository } = await fixture();
    repository.requireTransitionLog.mockRejectedValue(
      new DeviceAuthorizationNotFoundError(),
    );

    await expect(
      new DeviceAuthorizationFinder(repository).findTransitionLog(
        new DeviceAuthorizationTransitionLogFindMessage(
          authorization.getIdentityId(),
          authorization.getRecoveryAuthority(),
          DeviceAuthorizationRevision.initial(),
        ),
      ),
    ).rejects.toThrow(DeviceAuthorizationNotFoundError);
  });
});
