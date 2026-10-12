import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class DeviceSealedSecretDeliveryNotFoundError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.NOT_FOUND,
      404030,
      'Device sealed secret not found.',
    );
  }
}
