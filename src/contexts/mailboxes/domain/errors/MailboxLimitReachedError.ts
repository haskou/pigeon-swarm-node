import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxLimitReachedError extends BaseError {
  constructor() {
    super('This node cannot host more mailboxes.');
  }
}
