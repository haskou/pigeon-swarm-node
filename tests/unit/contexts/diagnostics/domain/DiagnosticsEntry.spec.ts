import { InvalidDiagnosticsEntryError } from '@app/contexts/diagnostics/domain/errors/InvalidDiagnosticsEntryError';
import { DiagnosticsEntry } from '@app/contexts/diagnostics/domain/value-objects/DiagnosticsEntry';

describe('DiagnosticsEntry', () => {
  it('rejects empty and oversized entries', () => {
    expect(() => new DiagnosticsEntry('')).toThrow(
      InvalidDiagnosticsEntryError,
    );
    expect(
      () => new DiagnosticsEntry('x'.repeat(DiagnosticsEntry.MAX_LENGTH + 1)),
    ).toThrow(InvalidDiagnosticsEntryError);
  });
});
