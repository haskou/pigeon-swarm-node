import { DomainError } from '@haskou/value-objects';

/** An approval must either take every pending entry or name some, never both or neither. */
export class InvalidNodeBlockSourceApprovalError extends DomainError {
  constructor() {
    super('Approve all pending entries or name the ones to approve.');
  }
}
