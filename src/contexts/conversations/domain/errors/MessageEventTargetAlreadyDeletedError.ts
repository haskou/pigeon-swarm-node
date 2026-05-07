import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageEventTargetAlreadyDeletedError extends BaseError {
  constructor() {
    super(
      'Deleted messages cannot be edited or deleted again',
      MessageEventTargetAlreadyDeletedError.prototype,
    );
  }
}
