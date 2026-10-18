import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class InvalidPresenceIdentityIdsError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.BAD_REQUEST,
      400120,
      'identityIds must list 1 to 100 distinct canonical identity ids.',
    );
  }
}
