import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class IdentityNetworkAdmissionRateLimitExceededError extends CustomHttpError {
  constructor(limit: number) {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429041,
      `Identity admission rate limit exceeded for a network. Maximum is ${limit} identity admissions per minute per network.`,
    );
  }
}
