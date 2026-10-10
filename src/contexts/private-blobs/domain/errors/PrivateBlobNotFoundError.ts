import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobNotFoundError extends BaseError {
  constructor() {
    super('Private blob not found.');
  }
}
