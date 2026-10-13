import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxEnvelopeNotFoundError extends BaseError {
  constructor() {
    super('Mailbox envelope not found.');
  }
}
