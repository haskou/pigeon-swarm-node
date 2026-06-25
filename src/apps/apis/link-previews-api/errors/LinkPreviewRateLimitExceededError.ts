import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class LinkPreviewRateLimitExceededError extends CustomHttpError {
  constructor(limit: number) {
    super(
      HttpRouteStatusEnum.TOO_MANY_REQUESTS,
      429020,
      `Link preview rate limit exceeded. Maximum is ${limit} previews per minute.`,
    );
  }
}
