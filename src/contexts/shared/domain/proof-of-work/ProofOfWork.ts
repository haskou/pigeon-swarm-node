import { createHash } from 'node:crypto';

import { leadingZeroBits } from './LeadingZeroBits';

/**
 * Hashcash-style proof of work over a domain prefix and a context's preimage
 * fields. SHA-256 over `domain:field:...:nonce` must start with the required
 * number of leading zero bits. Each context owns its field composition and its
 * difficulty; this object owns the mining and verification mechanics, so every
 * proof kind shares one nonce bound and one difficulty check.
 */
export class ProofOfWork {
  private static readonly MAX_NONCE_LENGTH = 64;

  public constructor(
    private readonly domain: string,
    private readonly fields: readonly string[],
  ) {}

  private preimage(nonce: string): string {
    return [this.domain, ...this.fields, nonce].join(':');
  }

  /**
   * Reference miner: first nonce, counting up from 0, that meets the difficulty
   * and `accepts`.
   */
  public mine(
    difficultyBits: number,
    accepts: (nonce: string) => boolean = () => true,
  ): string {
    const prefix = createHash('sha256').update(this.preimage(''));

    for (let nonce = 0; ; nonce += 1) {
      const candidate = nonce.toString();
      const digest = prefix.copy().update(candidate).digest();

      if (leadingZeroBits(digest) >= difficultyBits && accepts(candidate)) {
        return candidate;
      }
    }
  }

  public isValid(nonce: string, difficultyBits: number): boolean {
    if (nonce.length === 0 || nonce.length > ProofOfWork.MAX_NONCE_LENGTH) {
      return false;
    }

    const digest = createHash('sha256').update(this.preimage(nonce)).digest();

    return leadingZeroBits(digest) >= difficultyBits;
  }
}
