import BaseError from '@app/shared/domain/errors/BaseError';

export class ServerNotRunningError extends BaseError {
  constructor() {
    super('Server is not running', ServerNotRunningError.prototype);
  }
}
