import { assert } from '@haskou/value-objects';

import { DeviceAuthorization } from '../../domain/DeviceAuthorization';
import { DeviceCompromiseCaps } from '../../domain/DeviceCompromiseCaps';
import { DeviceAuthorizationNotFoundError } from '../../domain/errors/DeviceAuthorizationNotFoundError';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationFindMessage } from './messages/DeviceAuthorizationFindMessage';

export default class DeviceAuthorizationFinder {
  public constructor(
    private readonly repository: DeviceAuthorizationRepository,
  ) {}

  public async find(
    message: DeviceAuthorizationFindMessage,
  ): Promise<DeviceAuthorization> {
    const authorization = await this.repository.find(message.identityId);

    assert(authorization, new DeviceAuthorizationNotFoundError());

    return authorization;
  }

  public findCompromisedSince(
    message: DeviceAuthorizationFindMessage,
  ): Promise<DeviceCompromiseCaps> {
    return this.repository.findCompromisedSince(message.identityId);
  }
}
