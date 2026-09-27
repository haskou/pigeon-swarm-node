import { assert } from '@haskou/value-objects';

import DeviceAuthorizationAccessPolicy from '../../../identity-devices/domain/services/DeviceAuthorizationAccessPolicy';
import { InvalidPrivateAuthorizationError } from '../../domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateDeviceCredentialCodec } from '../../domain/services/PrivateDeviceCredentialCodec';
import { PrivateOperationUnitOfWork } from '../PrivateOperationUnitOfWork';
import { PrivateAuthorizationScopeProvisionMessage } from './messages/PrivateAuthorizationScopeProvisionMessage';
import { PrivateAuthorizationScopeProvisionStatus } from './PrivateAuthorizationScopeProvisionStatus';
import { PrivateGenesisAuthenticator } from './PrivateGenesisAuthenticator';
import { PrivateGenesisProjectionAuthorizer } from './PrivateGenesisProjectionAuthorizer';

export default class PrivateAuthorizationScopeProvisioner {
  public constructor(
    private readonly genesisAuthenticator: PrivateGenesisAuthenticator,
    private readonly projectionAuthorizer: PrivateGenesisProjectionAuthorizer,
    private readonly deviceAuthorization: DeviceAuthorizationAccessPolicy,
    private readonly credentialCodec: PrivateDeviceCredentialCodec,
    private readonly unitOfWork: PrivateOperationUnitOfWork,
  ) {}

  public async provision(
    message: PrivateAuthorizationScopeProvisionMessage,
  ): Promise<PrivateAuthorizationScopeProvisionStatus> {
    await this.deviceAuthorization.assertAuthorized(
      message.authenticatedIdentityId,
      this.credentialCodec.toCredential(message.ownerDeviceKey),
      message.identityAuthorizationRevision,
    );
    const genesis = this.genesisAuthenticator.verify(
      message.signedGenesisJson.valueOf(),
      message.ownerDeviceKey.valueOf(),
      message.protectedMlsState.valueOf(),
      message.authenticatedIdentityId,
    );
    assert(
      genesis.checkpoint.admitsIdentityDevice(
        message.authenticatedIdentityId,
        message.ownerDeviceKey,
      ),
      new InvalidPrivateAuthorizationError(),
    );
    const projection = this.projectionAuthorizer.authorize(
      genesis.checkpoint.getScopeId(),
      message.authenticatedIdentityId,
      message.projection.toPrimitives(),
    );
    const result = await this.unitOfWork.commitGenesis({
      ownerIdentityId: message.authenticatedIdentityId,
      projection,
      protectedMlsState: message.protectedMlsState.valueOf(),
      scope: PrivateAuthorizationScope.pin(
        genesis.checkpoint,
        genesis.genesisHash,
        message.ownerDeviceKey,
      ),
    });

    return result === 'committed'
      ? PrivateAuthorizationScopeProvisionStatus.ACCEPTED
      : PrivateAuthorizationScopeProvisionStatus.DUPLICATE;
  }
}
