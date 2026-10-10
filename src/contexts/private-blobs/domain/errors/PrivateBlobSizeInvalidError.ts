import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobSizeInvalidError extends BaseError {
  constructor(maxBytes: number) {
    super(`Private blob size must be between 1 and ${maxBytes} bytes.`);
  }
}
