import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageEventTargetNotFoundError extends BaseError {
  constructor() {
    super(
      'Message event target was not found',
      MessageEventTargetNotFoundError.prototype,
    );
  }
}
