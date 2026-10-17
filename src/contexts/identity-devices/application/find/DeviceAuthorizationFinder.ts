import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceAuthorizationTransitionLog } from '../../domain/DeviceAuthorizationTransitionLog';
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

  /** The signed transitions this node replays for the identity. */
  public findTransitionLog(
    message: DeviceAuthorizationFindMessage,
  ): Promise<DeviceAuthorizationTransitionLog> {
    return this.repository.requireTransitionLog(message.identityId);
  }
}
