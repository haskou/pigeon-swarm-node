import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class NotificationRecordRateLimitExceededError extends CustomHttpError {
  constructor(limit: number) {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429020,
      `Notification record rate limit exceeded. Maximum is ${limit} records per minute per identity.`,
    );
  }
}
