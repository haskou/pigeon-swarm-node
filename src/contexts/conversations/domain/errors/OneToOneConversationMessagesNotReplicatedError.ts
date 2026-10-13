import { DomainError } from '@haskou/value-objects';

/**
 * One-to-one messages travel only through the participants' opaque
 * mailboxes, so a one-to-one conversation has no replicated message log.
 */
export class OneToOneConversationMessagesNotReplicatedError extends DomainError {
  constructor() {
    super('One-to-one conversation messages are not replicated');
  }
}
