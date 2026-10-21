import { DomainError } from '@haskou/value-objects';

/**
 * The record cannot be judged yet: it depends on replicated state that has not
 * arrived. Any other refusal is final.
 */
export class PublicMutationPendingError extends DomainError {
  constructor() {
    super('Public mutation awaits replicated state');
  }
}
