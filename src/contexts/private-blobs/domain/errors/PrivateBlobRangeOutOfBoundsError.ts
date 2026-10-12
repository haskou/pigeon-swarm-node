import { BaseError } from '@haskou/ddd-kernel/domain';

/** The requested byte window cannot be satisfied by a blob of `size` bytes. */
export class PrivateBlobRangeOutOfBoundsError extends BaseError {
  constructor(public readonly size: number) {
    super('Requested byte range is outside the blob.');
  }
}
