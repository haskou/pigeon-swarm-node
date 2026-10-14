import { ValueObject } from '@haskou/value-objects';

/**
 * Only an explicit `true` counts as consent; anything else is a refusal.
 */
export class DiagnosticsConsent extends ValueObject<boolean> {
  constructor(value: boolean) {
    super(value === true);
  }

  public isGiven(): boolean {
    return this.value;
  }
}
