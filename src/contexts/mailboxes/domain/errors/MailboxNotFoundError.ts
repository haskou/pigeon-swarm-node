import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxNotFoundError extends BaseError {
  constructor() {
    super('Mailbox not found.');
  }
}
