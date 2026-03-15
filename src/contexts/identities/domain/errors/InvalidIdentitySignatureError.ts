import BaseError from '@app/shared/domain/errors/BaseError';

export class InvalidIdentitySignatureError extends BaseError {
  constructor() {
    super(
      'Invalid signature for the provided identity data.',
      InvalidIdentitySignatureError.prototype,
    );
  }
}
