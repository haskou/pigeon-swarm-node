import { DeviceSealingView } from '../../domain/DeviceSealingView';
import { DeviceAuthorizationRepository } from '../../domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealingRecordRepository } from '../../domain/repositories/DeviceSealingRecordRepository';
import { DeviceSealingViewFindMessage } from './messages/DeviceSealingViewFindMessage';

export default class DeviceSealingViewFinder {
  public constructor(
    private readonly authorizations: DeviceAuthorizationRepository,
    private readonly sealingRecords: DeviceSealingRecordRepository,
  ) {}

  /** Rejects with DeviceAuthorizationNotFoundError for an unknown identity. */
  public async find(
    message: DeviceSealingViewFindMessage,
  ): Promise<DeviceSealingView> {
    const authorization = await this.authorizations.require(message.identityId);

    return new DeviceSealingView(
      authorization.getRevision(),
      authorization,
      this.sealingRecords.findCurrent(message.identityId.valueOf()),
    );
  }
}
