import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class InvalidDeviceAuthorizationTransitionLogRequestError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.BAD_REQUEST,
      400050,
      'Invalid device authorization transition log request.',
    );
  }
}
