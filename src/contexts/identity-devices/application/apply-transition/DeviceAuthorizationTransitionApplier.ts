import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import DeviceAuthorizationEventPublisher from '../publish/DeviceAuthorizationEventPublisher';
import { ApplyDeviceAuthorizationTransitionMessage } from './messages/ApplyDeviceAuthorizationTransitionMessage';

export default class DeviceAuthorizationTransitionApplier {
  public constructor(
    private readonly repository: DeviceAuthorizationRepository,
    private readonly eventPublisher: DeviceAuthorizationEventPublisher,
  ) {}

  public async apply(
    message: ApplyDeviceAuthorizationTransitionMessage,
  ): Promise<DeviceAuthorization> {
    const authorization = await this.repository.compareAndApply(
      message.transition,
    );

    await this.eventPublisher.publish(authorization);

    return authorization;
  }
}
