import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { ApplyDeviceAuthorizationTransitionMessage } from './messages/ApplyDeviceAuthorizationTransitionMessage';

export default class DeviceAuthorizationTransitionApplier {
  public constructor(
    private readonly repository: DeviceAuthorizationRepository,
  ) {}

  public async apply(
    message: ApplyDeviceAuthorizationTransitionMessage,
  ): Promise<DeviceAuthorization> {
    return this.repository.compareAndApply(message.transition);
  }
}
