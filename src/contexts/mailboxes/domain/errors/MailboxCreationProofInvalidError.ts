import { BaseError } from '@haskou/ddd-kernel/domain';

export class MailboxCreationProofInvalidError extends BaseError {
  constructor() {
    super('Mailbox creation needs a valid creationNonce.');
  }
}
