import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageTargetAlreadyDeletedError extends BaseError {
  constructor() {
    super(
      'Deleted messages cannot be edited or deleted again',
      MessageTargetAlreadyDeletedError.prototype,
    );
  }
}
