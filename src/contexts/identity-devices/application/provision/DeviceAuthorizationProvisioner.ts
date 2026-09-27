import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationProvisionMessage } from './messages/DeviceAuthorizationProvisionMessage';

export default class DeviceAuthorizationProvisioner {
  public constructor(
    private readonly repository: DeviceAuthorizationRepository,
  ) {}

  public provision(
    message: DeviceAuthorizationProvisionMessage,
  ): Promise<void> {
    return this.repository.provision(
      DeviceAuthorization.genesis(
        message.identityId,
        message.networkIds,
        message.credential,
        message.recoveryAuthority,
      ),
      message.identityVersion,
      message.identityExternalIdentifier,
    );
  }
}
