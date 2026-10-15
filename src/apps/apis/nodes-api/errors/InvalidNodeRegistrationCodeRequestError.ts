import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class InvalidNodeRegistrationCodeRequestError extends CustomHttpError {
  constructor(message: string) {
    super(HttpRouteStatusEnum.BAD_REQUEST, 400070, message);
  }
}
