import BaseError from '@app/shared/domain/errors/BaseError';

export class InvalidPasswordError extends BaseError {
  constructor(minLength: number, maxLength: number) {
    super(
      `Password must be between ${minLength} and ${maxLength} characters long and include at least one uppercase letter, one lowercase letter and one symbol.`,
      InvalidPasswordError.prototype,
    );
  }
}
