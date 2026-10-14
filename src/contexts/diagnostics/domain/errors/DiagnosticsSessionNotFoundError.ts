import { DomainError } from '@haskou/value-objects';

export class DiagnosticsSessionNotFoundError extends DomainError {
  constructor() {
    super('No diagnostics session is open or retained on this node.');
  }
}
