import BaseError from '@app/shared/domain/errors/BaseError';

export class InvalidNodeIdError extends BaseError {
  constructor() {
    super('NodeId format is invalid.', InvalidNodeIdError.prototype);
  }
}
