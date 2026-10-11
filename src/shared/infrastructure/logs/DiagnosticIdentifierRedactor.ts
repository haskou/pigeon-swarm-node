import { createHmac, randomBytes } from 'crypto';

const DIGEST_HEX_LENGTH = 16;

/**
 * Replaces identifiers in diagnostic log lines with keyed digests.
 *
 * The key is random per instance, so lines from one process stay correlatable,
 * while a log file alone cannot be matched against known identifiers and the
 * digests change on restart.
 */
export class DiagnosticIdentifierRedactor {
  private readonly key = randomBytes(32);

  public redact(identifier: string): string {
    return createHmac('sha256', this.key)
      .update(identifier)
      .digest('hex')
      .slice(0, DIGEST_HEX_LENGTH);
  }
}
