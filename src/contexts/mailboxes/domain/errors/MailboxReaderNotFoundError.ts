import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxReaderNotFoundError extends BaseError {
  constructor() {
    super('Reader not found.');
  }
}
