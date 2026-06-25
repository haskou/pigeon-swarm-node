import { BaseError } from '@haskou/ddd-kernel/domain';

export class InvalidNodeIdError extends BaseError {
  constructor() {
    super('NodeId format is invalid.');
  }
}
