import { DeviceSealingRecord } from '../../domain/DeviceSealingRecord';
import { DeviceSealingRecordRejectedError } from '../../domain/errors/DeviceSealingRecordRejectedError';
import { DeviceSealingRecordRepository } from '../../domain/repositories/DeviceSealingRecordRepository';
import { PublishDeviceSealingRecordMessage } from './messages/PublishDeviceSealingRecordMessage';

export default class DeviceSealingRecordPublisher {
  public constructor(
    private readonly sealingRecords: DeviceSealingRecordRepository,
  ) {}

  /** Resolves true when the record was newly stored. */
  public async publish(
    message: PublishDeviceSealingRecordMessage,
  ): Promise<boolean> {
    const record = DeviceSealingRecord.fromStored({
      record: {
        deviceCredential: message.deviceCredential,
        identityId: message.identityId,
        sealingPublicKey: message.sealingPublicKey,
        utcDay: message.utcDay,
      },
      signature: message.signature,
    });

    if (!record) {
      throw new DeviceSealingRecordRejectedError();
    }

    return this.sealingRecords.publish(record);
  }
}
