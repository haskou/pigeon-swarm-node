import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageEventTargetAlreadyDeletedError extends BaseError {
  constructor() {
    super(
      'Deleted message events cannot be edited or deleted again',
      MessageEventTargetAlreadyDeletedError.prototype,
    );
  }
}
