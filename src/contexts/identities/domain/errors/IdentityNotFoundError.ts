import BaseError from '@app/shared/domain/errors/BaseError';

export class IdentityNotFoundError extends BaseError {
  constructor(id: string) {
    super(`Identity with id ${id} not found`, IdentityNotFoundError.prototype);
  }
}
