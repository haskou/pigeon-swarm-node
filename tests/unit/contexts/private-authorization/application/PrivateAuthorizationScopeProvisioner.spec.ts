import { PrivateAuthorizationGenesis } from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationGenesis';
import PrivateAuthorizationScopeProvisioner from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisioner';
import { PrivateGenesisAuthenticator } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisAuthenticator';
import { PrivateGenesisProjectionAuthorizer } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisProjectionAuthorizer';
import { PrivateAuthorizationScopeProvisionStatus } from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisionStatus';
import { PrivateAuthorizationScopeProvisionMessage } from '@app/contexts/private-authorization/application/provision-scope/messages/PrivateAuthorizationScopeProvisionMessage';
import { PrivateOperationUnitOfWork } from '@app/contexts/private-authorization/application/PrivateOperationUnitOfWork';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import DeviceAuthorizationAccessPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationAccessPolicy';
import { DeviceAuthorizationEpoch } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { PrivateDeviceCredentialCodec } from '@app/contexts/private-authorization/domain/services/PrivateDeviceCredentialCodec';
import { PrivateGenesisJson } from '@app/contexts/private-authorization/domain/value-objects/PrivateGenesisJson';
import { PrivateGenesisProjection } from '@app/contexts/private-authorization/domain/value-objects/PrivateGenesisProjection';
import { PrivateProtectedMlsState } from '@app/contexts/private-authorization/domain/value-objects/PrivateProtectedMlsState';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Buffer } from 'buffer';
import { generateKeyPairSync } from 'crypto';
import { mock } from 'jest-mock-extended';

describe('PrivateAuthorizationScopeProvisioner', () => {
  const ownerIdentityId = generateKeyPairSync('ed25519')
    .publicKey.export({ format: 'der', type: 'spki' })
    .toString('base64');
  const checkpoint = PrivateAuthorizationCheckpoint.genesis({
    admittedDeviceKeys: ['owner-device'],
    authorityKeys: ['owner-device'],
    controlCheckpointJson: JSON.stringify({
      policy: {
        devices: [
          {
            deviceKey: 'owner-device',
            identityId: ownerIdentityId,
            mlsCredentialHash: 'credential',
          },
        ],
      },
    }),
    deviceIdentities: [
      { deviceKey: 'owner-device', identityId: ownerIdentityId },
    ],
    freshnessAuthorityKey: 'owner-device',
    headHash: 'head',
    scopeId: 'scope',
  });
  const verifiedGenesis: PrivateAuthorizationGenesis = {
    checkpoint,
    genesisHash: 'genesis-hash',
  };
  const projection = { id: 'scope', ownerIdentityId };
  const protectedMlsState = Buffer.from('protected-state').toString('base64url');
  const authenticator = mock<PrivateGenesisAuthenticator>();
  const projectionAuthorizer = mock<PrivateGenesisProjectionAuthorizer>();
  const deviceAuthorization = mock<DeviceAuthorizationAccessPolicy>();
  const credentialCodec = mock<PrivateDeviceCredentialCodec>();
  const unitOfWork = mock<PrivateOperationUnitOfWork>();
  const provisioner = new PrivateAuthorizationScopeProvisioner(
    authenticator,
    projectionAuthorizer,
    deviceAuthorization,
    credentialCodec,
    unitOfWork,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    credentialCodec.toCredential.mockReturnValue(
      DeviceCredential.fromIdentityId(new IdentityId(ownerIdentityId)),
    );
    authenticator.verify.mockReturnValue(verifiedGenesis);
    projectionAuthorizer.authorize.mockReturnValue(projection);
    unitOfWork.commitGenesis.mockResolvedValue('committed');
  });

  it('verifies, authorizes and atomically commits an authenticated genesis', async () => {
    const message = new PrivateAuthorizationScopeProvisionMessage(
      ownerIdentityId,
      'genesis',
      0,
      'owner-device',
      'signed-genesis',
      protectedMlsState,
      projection,
    );

    expect(message.signedGenesisJson).toBeInstanceOf(PrivateGenesisJson);
    expect(message.protectedMlsState).toBeInstanceOf(PrivateProtectedMlsState);
    expect(message.projection).toBeInstanceOf(PrivateGenesisProjection);
    await expect(
      provisioner.provision(message),
    ).resolves.toEqual(PrivateAuthorizationScopeProvisionStatus.ACCEPTED);
    expect(authenticator.verify).toHaveBeenCalledWith(
      'signed-genesis',
      'owner-device',
      protectedMlsState,
      new IdentityId(ownerIdentityId),
    );
    expect(deviceAuthorization.assertAuthorized).toHaveBeenCalledWith(
      new IdentityId(ownerIdentityId),
      DeviceCredential.fromIdentityId(new IdentityId(ownerIdentityId)),
      DeviceAuthorizationEpoch.genesis(),
      DeviceAuthorizationRevision.initial(),
    );
    expect(projectionAuthorizer.authorize).toHaveBeenCalledWith(
      checkpoint.getScopeId(),
      new IdentityId(ownerIdentityId),
      projection,
    );
    expect(unitOfWork.commitGenesis).toHaveBeenCalledWith({
      ownerIdentityId: new IdentityId(ownerIdentityId),
      projection,
      protectedMlsState,
      scope: expect.objectContaining({}),
    });
  });

  it('returns duplicate when the exact genesis already exists', async () => {
    unitOfWork.commitGenesis.mockResolvedValue('duplicate');

    await expect(
      provisioner.provision(
        new PrivateAuthorizationScopeProvisionMessage(
          ownerIdentityId,
          'genesis',
          0,
          'owner-device',
          'signed-genesis',
          protectedMlsState,
          projection,
        ),
      ),
    ).resolves.toEqual(PrivateAuthorizationScopeProvisionStatus.DUPLICATE);
  });

  it('does not persist a projection that fails authorization', async () => {
    projectionAuthorizer.authorize.mockImplementation(() => {
      throw new Error('invalid projection');
    });

    await expect(
      provisioner.provision(
        new PrivateAuthorizationScopeProvisionMessage(
          ownerIdentityId,
          'genesis',
          0,
          'owner-device',
          'signed-genesis',
          protectedMlsState,
          projection,
        ),
      ),
    ).rejects.toThrow('invalid projection');
    expect(unitOfWork.commitGenesis).not.toHaveBeenCalled();
  });
});
