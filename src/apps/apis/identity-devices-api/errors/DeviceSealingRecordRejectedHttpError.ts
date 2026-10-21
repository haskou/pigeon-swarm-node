import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class DeviceSealingRecordRejectedHttpError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.UNPROCESSABLE_ENTITY,
      422040,
      'Device sealing record was not admitted.',
    );
  }
}
