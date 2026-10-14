import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class InvalidCommunityOperationsQueryError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.BAD_REQUEST,
      400060,
      'Invalid community operations query.',
    );
  }
}
