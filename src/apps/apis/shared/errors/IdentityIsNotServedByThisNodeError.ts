import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class IdentityIsNotServedByThisNodeError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.FORBIDDEN,
      403014,
      'Identity is not served by this node.',
    );
  }
}
