import { ApplyDeviceAuthorizationTransitionMessage } from '@app/contexts/identity-devices/application/apply-transition/messages/ApplyDeviceAuthorizationTransitionMessage';
import DeviceAuthorizationTransitionApplier from '@app/contexts/identity-devices/application/apply-transition/DeviceAuthorizationTransitionApplier';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

describe(DeviceAuthorizationTransitionApplier.name, () => {
  it('passes a Value Object transition to the atomic repository boundary', async () => {
    const owner = await KeyPair.generate();
    const identity = await KeyPair.generate();
    const target = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    const identityId = new IdentityId(identity.toPrimitives().publicKey);
    const repository = mock<DeviceAuthorizationRepository>();
    const authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Timestamp.now().valueOf() + 60_000),
        Timestamp.now(),
      ),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );
    const transition = proven.authorize(owner.sign(proven.getSigningPayload()));
    const message = new ApplyDeviceAuthorizationTransitionMessage(transition);
    repository.compareAndApply.mockResolvedValue(authorization);

    const result = await new DeviceAuthorizationTransitionApplier(
      repository,
    ).apply(message);

    expect(message.transition).toBeInstanceOf(DeviceAuthorizationTransition);
    expect(repository.compareAndApply).toHaveBeenCalledWith(message.transition);
    expect(result).toBe(authorization);
  });
});
