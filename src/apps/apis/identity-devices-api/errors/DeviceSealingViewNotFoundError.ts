import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class DeviceSealingViewNotFoundError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.NOT_FOUND,
      404050,
      'Device sealing view not found.',
    );
  }
}
