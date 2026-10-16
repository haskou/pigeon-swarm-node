import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class SignedRequestBodyIsTooLargeError extends CustomHttpError {
  constructor(maxBytes: number) {
    super(
      HttpRouteStatusEnum.PAYLOAD_TOO_LARGE,
      413010,
      `Request body is too large. Maximum size is ${maxBytes} bytes.`,
    );
  }
}
