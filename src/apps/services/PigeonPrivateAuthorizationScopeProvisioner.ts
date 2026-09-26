import PrivateCommunityGenesisAuthorizer from '../../contexts/communities/application/apply-private-control/PrivateCommunityGenesisAuthorizer';
import { PrivateAuthorizationScopeProvisionMessage } from '../../contexts/private-authorization/application/provision-scope/messages/PrivateAuthorizationScopeProvisionMessage';
import PrivateAuthorizationScopeProvisioner from '../../contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisioner';
import { PrivateAuthorizationScopeProvisionStatus } from '../../contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisionStatus';
import LegacyIdentityDeviceBinding from '../../contexts/private-authorization/infrastructure/crypto/LegacyIdentityDeviceBinding';
import PrivateGenesisVerifier from '../../contexts/private-authorization/infrastructure/crypto/PrivateGenesisVerifier';
import LocalPrivateOperationUnitOfWork from '../../contexts/private-authorization/infrastructure/local-db/LocalPrivateOperationUnitOfWork';

export default class PigeonPrivateAuthorizationScopeProvisioner {
  private readonly provisioner: PrivateAuthorizationScopeProvisioner;

  public constructor(
    genesisAuthenticator: PrivateGenesisVerifier,
    projectionAuthorizer: PrivateCommunityGenesisAuthorizer,
    identityBinding: LegacyIdentityDeviceBinding,
    unitOfWork: LocalPrivateOperationUnitOfWork,
  ) {
    this.provisioner = new PrivateAuthorizationScopeProvisioner(
      genesisAuthenticator,
      projectionAuthorizer,
      identityBinding,
      unitOfWork,
    );
  }

  public async provision(
    message: PrivateAuthorizationScopeProvisionMessage,
  ): Promise<PrivateAuthorizationScopeProvisionStatus> {
    return this.provisioner.provision(message);
  }
}
