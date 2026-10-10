import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * A bearer capability. The server keeps only its SHA-256, so a leaked
 * database does not leak usable capabilities. Tokens carry 256 random bits,
 * which is why an unsalted fast hash is sufficient.
 */
export class PrivateBlobCapability {
  private static readonly TOKEN_BYTES = 32;

  public static generate(): { hash: string; token: string } {
    const token = randomBytes(PrivateBlobCapability.TOKEN_BYTES).toString(
      'base64url',
    );

    return { hash: PrivateBlobCapability.hash(token), token };
  }

  public static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  public static matches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(PrivateBlobCapability.hash(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
