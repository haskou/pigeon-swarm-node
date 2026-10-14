import { DomainError } from '@haskou/value-objects';

export class InvalidDiagnosticsDurationError extends DomainError {
  constructor(minMinutes: number, maxMinutes: number) {
    super(
      `Diagnostics must last between ${minMinutes} and ${maxMinutes} minutes.`,
    );
  }
}
