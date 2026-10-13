import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceCompromiseCaps } from '../../domain/DeviceCompromiseCaps';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationFindMessage } from './messages/DeviceAuthorizationFindMessage';

export default class DeviceAuthorizationFinder {
  public constructor(
    private readonly repository: DeviceAuthorizationRepository,
  ) {}

  public find(
    message: DeviceAuthorizationFindMessage,
  ): Promise<DeviceAuthorization> {
    return this.repository.require(message.identityId);
  }

  public findCompromisedSince(
    message: DeviceAuthorizationFindMessage,
  ): Promise<DeviceCompromiseCaps> {
    return this.repository.findCompromisedSince(message.identityId);
  }
}
