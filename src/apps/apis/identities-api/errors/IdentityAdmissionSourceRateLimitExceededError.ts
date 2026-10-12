import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class IdentityAdmissionSourceRateLimitExceededError extends CustomHttpError {
  constructor(limit: number) {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429042,
      `Identity admission rate limit exceeded. Maximum is ${limit} per minute per address.`,
    );
  }
}
