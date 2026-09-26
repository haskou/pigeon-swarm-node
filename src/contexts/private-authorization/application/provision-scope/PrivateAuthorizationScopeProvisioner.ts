import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateIdentityBinding } from '../../domain/services/PrivateIdentityBinding';
import { PrivateAuthorizationDeviceKey } from '../../domain/value-objects/PrivateAuthorizationDeviceKey';
import { PrivateOperationUnitOfWork } from '../PrivateOperationUnitOfWork';
import { PrivateAuthorizationScopeProvisionMessage } from './messages/PrivateAuthorizationScopeProvisionMessage';
import { PrivateAuthorizationScopeProvisionStatus } from './PrivateAuthorizationScopeProvisionStatus';
import { PrivateGenesisAuthenticator } from './PrivateGenesisAuthenticator';
import { PrivateGenesisProjectionAuthorizer } from './PrivateGenesisProjectionAuthorizer';

export default class PrivateAuthorizationScopeProvisioner {
  public constructor(
    private readonly genesisAuthenticator: PrivateGenesisAuthenticator,
    private readonly projectionAuthorizer: PrivateGenesisProjectionAuthorizer,
    private readonly identityBinding: PrivateIdentityBinding,
    private readonly unitOfWork: PrivateOperationUnitOfWork,
  ) {}

  public async provision(
    message: PrivateAuthorizationScopeProvisionMessage,
  ): Promise<PrivateAuthorizationScopeProvisionStatus> {
    const ownerDeviceKey = this.identityBinding.bind(
      message.authenticatedIdentityId.valueOf(),
    );
    const genesis = this.genesisAuthenticator.verify(
      message.signedGenesisJson,
      ownerDeviceKey,
      message.protectedMlsState,
    );
    const projection = this.projectionAuthorizer.authorize(
      genesis.checkpoint.getScopeId(),
      message.authenticatedIdentityId,
      message.projection,
    );
    const result = await this.unitOfWork.commitGenesis({
      ownerIdentityId: message.authenticatedIdentityId,
      projection,
      protectedMlsState: message.protectedMlsState,
      scope: PrivateAuthorizationScope.pin(
        genesis.checkpoint,
        genesis.genesisHash,
        new PrivateAuthorizationDeviceKey(ownerDeviceKey),
      ),
    });

    return result === 'committed'
      ? PrivateAuthorizationScopeProvisionStatus.ACCEPTED
      : PrivateAuthorizationScopeProvisionStatus.DUPLICATE;
  }
}
