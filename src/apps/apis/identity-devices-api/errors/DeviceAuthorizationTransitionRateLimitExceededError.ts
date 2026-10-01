import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class DeviceAuthorizationTransitionRateLimitExceededError extends CustomHttpError {
  constructor() {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429030,
      'Device authorization transition rate limit exceeded.',
    );
  }
}
