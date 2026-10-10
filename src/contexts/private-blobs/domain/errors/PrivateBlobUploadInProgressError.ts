import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobUploadInProgressError extends BaseError {
  constructor() {
    super('Private blob upload is already in progress.');
  }
}
