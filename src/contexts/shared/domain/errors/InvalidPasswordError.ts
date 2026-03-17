import BaseError from '@app/shared/domain/errors/BaseError';

export class InvalidPasswordError extends BaseError {
  constructor(minLength: number) {
    super(
      `Password must be at least ${minLength} characters long.`,
      InvalidPasswordError.prototype,
    );
  }
}
