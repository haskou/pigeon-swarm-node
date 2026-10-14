import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceAuthorizationTransitionDisclosure } from '../../domain/DeviceAuthorizationTransitionDisclosure';
import { DeviceCompromiseCaps } from '../../domain/DeviceCompromiseCaps';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationFindMessage } from './messages/DeviceAuthorizationFindMessage';
import { DeviceAuthorizationTransitionLogFindMessage } from './messages/DeviceAuthorizationTransitionLogFindMessage';

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

  /** The signed transitions the reader may verify, above a revision. */
  public async findTransitionLog(
    message: DeviceAuthorizationTransitionLogFindMessage,
  ): Promise<DeviceAuthorizationTransitionDisclosure> {
    const log = await this.repository.requireTransitionLog(message.identityId);

    return log.disclosedTo(message.reader).after(message.after);
  }
}
