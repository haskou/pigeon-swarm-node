import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';

export class PublicIPFSContentTooLargeError extends CustomHttpError {
  constructor(maxSizeBytes: number) {
    super(
      HttpRouteStatusEnum.UNPROCESSABLE_ENTITY,
      422030,
      `Public IPFS content is too large. Maximum size is ${maxSizeBytes} bytes.`,
    );
  }
}
