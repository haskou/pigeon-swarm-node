import { DiagnosticIdentifierRedactor } from '@app/shared/infrastructure/logs/DiagnosticIdentifierRedactor';

describe('DiagnosticIdentifierRedactor', () => {
  const identifier = '12D3KooWExamplePeerIdentifierValue';

  it('replaces an identifier with a short hex digest that does not contain it', () => {
    const digest = new DiagnosticIdentifierRedactor().redact(identifier);

    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(digest).not.toContain(identifier);
  });

  it('returns the same digest for the same identifier within one process', () => {
    const redactor = new DiagnosticIdentifierRedactor();

    expect(redactor.redact(identifier)).toBe(redactor.redact(identifier));
  });

  it('returns different digests for the same identifier across processes', () => {
    const first = new DiagnosticIdentifierRedactor().redact(identifier);
    const second = new DiagnosticIdentifierRedactor().redact(identifier);

    expect(first).not.toBe(second);
  });
});
