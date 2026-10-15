import { DomainError } from '@haskou/value-objects';

/** No adopted source is pinned to that owner identity. */
export class NodeBlockSourceNotFoundError extends DomainError {
  constructor() {
    super('Node block source is not adopted.');
  }
}
