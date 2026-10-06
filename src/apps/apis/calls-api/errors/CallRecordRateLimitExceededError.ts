import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class CallRecordRateLimitExceededError extends CustomHttpError {
  constructor(limit: number) {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429021,
      `Call record rate limit exceeded. Maximum is ${limit} records per minute per identity.`,
    );
  }
}
