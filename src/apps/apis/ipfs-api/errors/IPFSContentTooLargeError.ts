import CustomHttpError from '@app/shared/infrastructure/errors/CustomHttpError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

export class IPFSContentTooLargeError extends CustomHttpError {
  constructor(maxSizeBytes: number) {
    super(
      HttpRouteStatusEnum.PAYLOAD_TOO_LARGE,
      422030,
      `IPFS content is too large. Maximum size is ${maxSizeBytes} bytes.`,
    );
  }
}
