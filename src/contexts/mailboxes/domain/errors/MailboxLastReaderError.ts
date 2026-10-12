import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxLastReaderError extends BaseError {
  constructor() {
    super('The last reader of a mailbox cannot be revoked.');
  }
}
