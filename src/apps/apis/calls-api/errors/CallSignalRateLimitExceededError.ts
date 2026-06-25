import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class CallSignalRateLimitExceededError extends CustomHttpError {
  constructor(limit: number) {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429010,
      `Call signal rate limit exceeded. Maximum is ${limit} signals per minute.`,
    );
  }
}
