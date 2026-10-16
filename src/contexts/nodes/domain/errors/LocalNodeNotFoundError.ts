import { DomainError } from '@haskou/value-objects';

export class LocalNodeNotFoundError extends DomainError {
  constructor() {
    super('No node has run on this local database yet.');
  }
}
