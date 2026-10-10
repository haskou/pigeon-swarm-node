import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobUploadClosedError extends BaseError {
  constructor() {
    super('Private blob upload is already complete.');
  }
}
