import { createHash, timingSafeEqual } from 'crypto';

/**
 * A bearer capability. The server stores only SHA-256 hex of the token, so a
 * leaked database does not leak usable capabilities. Tokens carry 256 random
 * bits chosen client side, which is why an unsalted fast hash is sufficient.
 */
export class MailboxCapability {
  public static readonly HASH_PATTERN = /^[0-9a-f]{64}$/;

  public static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  public static matches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(MailboxCapability.hash(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
