import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageTargetNotFoundError extends BaseError {
  constructor() {
    super('Message target was not found', MessageTargetNotFoundError.prototype);
  }
}
