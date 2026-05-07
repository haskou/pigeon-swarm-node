import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageEventTargetAuthorMismatchError extends BaseError {
  constructor() {
    super(
      'Only the original message author can edit or delete it',
      MessageEventTargetAuthorMismatchError.prototype,
    );
  }
}
