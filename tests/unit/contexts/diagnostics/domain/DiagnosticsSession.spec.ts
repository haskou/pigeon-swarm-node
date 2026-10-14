import { DiagnosticsSession } from '@app/contexts/diagnostics/domain/DiagnosticsSession';
import { DiagnosticsConsentRequiredError } from '@app/contexts/diagnostics/domain/errors/DiagnosticsConsentRequiredError';
import { InvalidDiagnosticsDurationError } from '@app/contexts/diagnostics/domain/errors/InvalidDiagnosticsDurationError';
import { DiagnosticsConsent } from '@app/contexts/diagnostics/domain/value-objects/DiagnosticsConsent';
import { DiagnosticsDuration } from '@app/contexts/diagnostics/domain/value-objects/DiagnosticsDuration';
import { DiagnosticsEntry } from '@app/contexts/diagnostics/domain/value-objects/DiagnosticsEntry';
import { Timestamp } from '@haskou/value-objects';

describe('DiagnosticsSession', () => {
  const openedAt = new Timestamp(1_770_000_000_000);

  function openFor(minutes: number): DiagnosticsSession {
    return DiagnosticsSession.open(
      new DiagnosticsDuration(minutes),
      new DiagnosticsConsent(true),
      openedAt,
    );
  }

  it('cannot open without the explicit consent of the node owner', () => {
    expect(() =>
      DiagnosticsSession.open(
        new DiagnosticsDuration(10),
        new DiagnosticsConsent(false),
        openedAt,
      ),
    ).toThrow(DiagnosticsConsentRequiredError);
  });

  it.each([0, -1, 61])('rejects a duration of %p minutes', (minutes) => {
    expect(() => new DiagnosticsDuration(minutes)).toThrow(
      InvalidDiagnosticsDurationError,
    );
  });

  it('stops recording on its own when the consented duration ends', () => {
    const session = openFor(10);
    const closesAt = openedAt.addMinutes(10);

    expect(session.isRecordingAt(closesAt.addMilliseconds(-1))).toBe(true);
    expect(session.isRecordingAt(closesAt)).toBe(false);
  });

  it('keeps the export for one hour after recording ends and then discards it', () => {
    const session = openFor(10);
    const discardsAt = openedAt.addMinutes(70);

    expect(session.isDiscardedAt(discardsAt.addMilliseconds(-1))).toBe(false);
    expect(session.isDiscardedAt(discardsAt)).toBe(true);
  });

  it('records entries only while recording', () => {
    const session = openFor(1);

    session.append(new DiagnosticsEntry('inside'), openedAt.addSeconds(30));
    session.append(new DiagnosticsEntry('outside'), openedAt.addMinutes(1));

    expect(session.toPrimitives().entries).toEqual(['inside']);
  });

  it('keeps only the newest entries', () => {
    const session = openFor(60);

    for (let index = 0; index <= DiagnosticsSession.MAX_ENTRIES; index += 1) {
      session.append(new DiagnosticsEntry(`line ${index}`), openedAt);
    }

    const entries = session.toPrimitives().entries;

    expect(entries).toHaveLength(DiagnosticsSession.MAX_ENTRIES);
    expect(entries[0]).toBe('line 1');
  });

  it('exports its window and entries', () => {
    const session = openFor(15);

    session.append(new DiagnosticsEntry('redacted line'), openedAt);

    expect(session.toPrimitives()).toEqual({
      closesAt: openedAt.addMinutes(15).valueOf(),
      discardsAt: openedAt.addMinutes(75).valueOf(),
      entries: ['redacted line'],
      openedAt: openedAt.valueOf(),
    });
  });
});
