import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobQuotaExceededError extends BaseError {
  constructor() {
    super('Private blob storage quota exceeded.');
  }
}
