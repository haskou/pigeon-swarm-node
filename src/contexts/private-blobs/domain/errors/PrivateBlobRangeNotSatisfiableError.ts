import { BaseError } from '@haskou/ddd-kernel/domain';

export class PrivateBlobRangeNotSatisfiableError extends BaseError {
  constructor(public readonly size: number) {
    super('Requested range is not satisfiable.');
  }
}
