import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxCursorInvalidError extends BaseError {
  constructor() {
    super('Mailbox cursor must be a non-negative integer.');
  }
}
