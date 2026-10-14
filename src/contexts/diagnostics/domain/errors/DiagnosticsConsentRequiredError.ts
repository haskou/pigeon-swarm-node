import { DomainError } from '@haskou/value-objects';

export class DiagnosticsConsentRequiredError extends DomainError {
  constructor() {
    super('Diagnostics require the explicit consent of the node owner.');
  }
}
