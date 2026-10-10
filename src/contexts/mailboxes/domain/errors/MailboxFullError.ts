import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxFullError extends BaseError {
  constructor() {
    super('Mailbox is full.');
  }
}
