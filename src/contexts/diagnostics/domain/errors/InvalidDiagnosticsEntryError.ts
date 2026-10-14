import { DomainError } from '@haskou/value-objects';

export class InvalidDiagnosticsEntryError extends DomainError {
  constructor(maxLength: number) {
    super(
      `Diagnostics entries must hold between 1 and ${maxLength} characters.`,
    );
  }
}
