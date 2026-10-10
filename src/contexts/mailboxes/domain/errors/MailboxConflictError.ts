import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxConflictError extends BaseError {
  constructor() {
    super('Mailbox already exists with different capabilities.');
  }
}
