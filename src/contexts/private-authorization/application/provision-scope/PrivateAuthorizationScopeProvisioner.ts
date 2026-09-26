import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateIdentityBinding } from '../../domain/services/PrivateIdentityBinding';
import { PrivateOperationUnitOfWork } from '../PrivateOperationUnitOfWork';
import { PrivateAuthorizationScopeProvisionMessage } from './messages/PrivateAuthorizationScopeProvisionMessage';
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
  ): Promise<{ status: 'accepted' | 'duplicate' }> {
    const ownerDeviceKey = this.identityBinding.bind(
      message.authenticatedIdentityId,
    );
    const genesis = this.genesisAuthenticator.verify(
      message.signedGenesisJson,
      ownerDeviceKey,
      message.protectedMlsState,
    );
    const scopeId = genesis.checkpoint.toPrimitives().scopeId;
    const projection = this.projectionAuthorizer.authorize(
      scopeId,
      message.authenticatedIdentityId,
      message.projection,
    );
    const result = await this.unitOfWork.commitGenesis({
      projection,
      protectedMlsState: message.protectedMlsState,
      scope: PrivateAuthorizationScope.pin(
        genesis.checkpoint,
        genesis.genesisHash,
      ),
    });

    return { status: result === 'committed' ? 'accepted' : 'duplicate' };
  }
}
