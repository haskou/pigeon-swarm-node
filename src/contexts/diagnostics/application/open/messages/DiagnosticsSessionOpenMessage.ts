import { DiagnosticsConsent } from '../../../domain/value-objects/DiagnosticsConsent';
import { DiagnosticsDuration } from '../../../domain/value-objects/DiagnosticsDuration';

export class DiagnosticsSessionOpenMessage {
  constructor(
    public readonly minutes: number,
    public readonly consent: boolean,
  ) {}

  public getConsent(): DiagnosticsConsent {
    return new DiagnosticsConsent(this.consent);
  }

  public getDuration(): DiagnosticsDuration {
    return new DiagnosticsDuration(this.minutes);
  }
}
