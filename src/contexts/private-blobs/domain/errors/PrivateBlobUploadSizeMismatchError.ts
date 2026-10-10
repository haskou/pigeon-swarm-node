import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobUploadSizeMismatchError extends BaseError {
  constructor() {
    super('Uploaded bytes do not match the reserved size.');
  }
}
