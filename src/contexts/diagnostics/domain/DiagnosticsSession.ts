import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, Timestamp } from '@haskou/value-objects';

import { DiagnosticsConsentRequiredError } from './errors/DiagnosticsConsentRequiredError';
import { DiagnosticsConsent } from './value-objects/DiagnosticsConsent';
import { DiagnosticsDuration } from './value-objects/DiagnosticsDuration';
import { DiagnosticsEntry } from './value-objects/DiagnosticsEntry';

/**
 * A diagnostics session the node owner opened with explicit consent. It
 * records redacted entries only until `closesAt` and is discarded at
 * `discardsAt`, so nothing it holds outlives the consented window by more than
 * the retention period.
 */
export class DiagnosticsSession extends AggregateRoot {
  public static readonly MAX_ENTRIES = 1_000;
  public static readonly RETENTION_MINUTES = 60;

  public static open(
    duration: DiagnosticsDuration,
    consent: DiagnosticsConsent,
    openedAt: Timestamp,
  ): DiagnosticsSession {
    assert(consent.isGiven(), new DiagnosticsConsentRequiredError());

    return new DiagnosticsSession(openedAt, openedAt.addMinutes(duration), []);
  }

  private constructor(
    private readonly openedAt: Timestamp,
    private readonly closesAt: Timestamp,
    private readonly entries: DiagnosticsEntry[],
  ) {
    super();
  }

  private discardsAt(): Timestamp {
    return this.closesAt.addMinutes(DiagnosticsSession.RETENTION_MINUTES);
  }

  public append(entry: DiagnosticsEntry, at: Timestamp): void {
    if (!this.isRecordingAt(at)) {
      return;
    }

    this.entries.push(entry);

    if (this.entries.length > DiagnosticsSession.MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  public isRecordingAt(at: Timestamp): boolean {
    return at.isAfterOrEqual(this.openedAt) && at.isBefore(this.closesAt);
  }

  public isDiscardedAt(at: Timestamp): boolean {
    return at.isAfterOrEqual(this.discardsAt());
  }

  public getDiscardsAt(): Timestamp {
    return this.discardsAt();
  }

  public toPrimitives() {
    return {
      closesAt: this.closesAt.valueOf(),
      discardsAt: this.discardsAt().valueOf(),
      entries: this.entries.map((entry) => entry.valueOf()),
      openedAt: this.openedAt.valueOf(),
    };
  }
}
