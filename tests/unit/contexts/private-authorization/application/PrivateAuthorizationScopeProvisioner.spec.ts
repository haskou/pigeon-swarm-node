import { PrivateAuthorizationGenesis } from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationGenesis';
import PrivateAuthorizationScopeProvisioner from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisioner';
import { PrivateGenesisAuthenticator } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisAuthenticator';
import { PrivateGenesisProjectionAuthorizer } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisProjectionAuthorizer';
import { PrivateAuthorizationScopeProvisionStatus } from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisionStatus';
import { PrivateAuthorizationScopeProvisionMessage } from '@app/contexts/private-authorization/application/provision-scope/messages/PrivateAuthorizationScopeProvisionMessage';
import { PrivateOperationUnitOfWork } from '@app/contexts/private-authorization/application/PrivateOperationUnitOfWork';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateIdentityBinding } from '@app/contexts/private-authorization/domain/services/PrivateIdentityBinding';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'crypto';
import { mock } from 'jest-mock-extended';

describe('PrivateAuthorizationScopeProvisioner', () => {
  const ownerIdentityId = generateKeyPairSync('ed25519')
    .publicKey.export({ format: 'der', type: 'spki' })
    .toString('base64');
  const checkpoint = PrivateAuthorizationCheckpoint.genesis({
    admittedDeviceKeys: ['owner-device'],
    authorityKeys: ['owner-device'],
    controlCheckpointJson: '{}',
    freshnessAuthorityKey: 'owner-device',
    headHash: 'head',
    scopeId: 'scope',
  });
  const verifiedGenesis: PrivateAuthorizationGenesis = {
    checkpoint,
    genesisHash: 'genesis-hash',
  };
  const projection = { id: 'scope', ownerIdentityId };
  const authenticator = mock<PrivateGenesisAuthenticator>();
  const projectionAuthorizer = mock<PrivateGenesisProjectionAuthorizer>();
  const identityBinding = mock<PrivateIdentityBinding>();
  const unitOfWork = mock<PrivateOperationUnitOfWork>();
  const provisioner = new PrivateAuthorizationScopeProvisioner(
    authenticator,
    projectionAuthorizer,
    identityBinding,
    unitOfWork,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    identityBinding.bind.mockReturnValue('owner-device');
    authenticator.verify.mockReturnValue(verifiedGenesis);
    projectionAuthorizer.authorize.mockReturnValue(projection);
    unitOfWork.commitGenesis.mockResolvedValue('committed');
  });

  it('verifies, authorizes and atomically commits an authenticated genesis', async () => {
    await expect(
      provisioner.provision(
        new PrivateAuthorizationScopeProvisionMessage(
          ownerIdentityId,
          'signed-genesis',
          'protected-state',
          projection,
        ),
      ),
    ).resolves.toEqual(PrivateAuthorizationScopeProvisionStatus.ACCEPTED);
    expect(authenticator.verify).toHaveBeenCalledWith(
      'signed-genesis',
      'owner-device',
      'protected-state',
    );
    expect(projectionAuthorizer.authorize).toHaveBeenCalledWith(
      checkpoint.getScopeId(),
      new IdentityId(ownerIdentityId),
      projection,
    );
    expect(unitOfWork.commitGenesis).toHaveBeenCalledWith({
      projection,
      protectedMlsState: 'protected-state',
      scope: expect.objectContaining({}),
    });
  });

  it('returns duplicate when the exact genesis already exists', async () => {
    unitOfWork.commitGenesis.mockResolvedValue('duplicate');

    await expect(
      provisioner.provision(
        new PrivateAuthorizationScopeProvisionMessage(
          ownerIdentityId,
          'signed-genesis',
          'protected-state',
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
          'signed-genesis',
          'protected-state',
          projection,
        ),
      ),
    ).rejects.toThrow('invalid projection');
    expect(unitOfWork.commitGenesis).not.toHaveBeenCalled();
  });
});
