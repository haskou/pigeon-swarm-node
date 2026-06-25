import { BaseError } from '@haskou/ddd-kernel/domain';

export class ServerNotRunningError extends BaseError {
  constructor() {
    super('Server is not running');
  }
}
