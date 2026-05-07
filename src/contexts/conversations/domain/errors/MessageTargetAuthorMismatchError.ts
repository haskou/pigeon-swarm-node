import BaseError from '@app/shared/domain/errors/BaseError';

export class MessageTargetAuthorMismatchError extends BaseError {
  constructor() {
    super(
      'Only the original message author can edit or delete it',
      MessageTargetAuthorMismatchError.prototype,
    );
  }
}
