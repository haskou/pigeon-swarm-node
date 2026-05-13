import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';

export class IPFSContentTooLargeError extends CustomHttpError {
  constructor(maxSizeBytes: number) {
    super(
      HttpRouteStatusEnum.PAYLOAD_TOO_LARGE,
      422030,
      `IPFS content is too large. Maximum size is ${maxSizeBytes} bytes.`,
    );
  }
}
