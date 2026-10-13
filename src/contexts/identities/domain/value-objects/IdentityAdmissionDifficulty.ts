import { Integer, Timestamp } from '@haskou/value-objects';

import { IdentityAdmissionProof } from './IdentityAdmissionProof';

/**
 * Leading zero bits a node asks of an identity admission proof submitted
 * through its own API. The floor is the protocol constant every node checks on
 * every record, so validity converges across the network. Above it, a node
 * asks one more bit per doubling of the admissions it counted into a network
 * in the current window beyond FREE_ADMISSIONS_PER_WINDOW, up to MAX_BITS.
 * Counted admissions are the ones this node accepted plus the fresh ones it
 * observed replicating in from other nodes, so the price tracks the
 * network-wide admission rate. The raised requirement is local admission
 * policy, never a validity rule: replicated records are still judged at the
 * floor.
 */
export class IdentityAdmissionDifficulty extends Integer {
  public static readonly FREE_ADMISSIONS_PER_WINDOW = 60;
  public static readonly MAX_BITS = 20;
  /**
   * How far a signed admission time may sit from a node clock for the
   * admission to count as new. Older (or future-dated) admissions are priced
   * at MAX_BITS by the API and never counted when observed, so replaying
   * history cannot inflate load and backdating cannot dodge observation.
   */
  public static readonly FRESHNESS_HORIZON_MS = 10 * 60_000;

  public static floor(): IdentityAdmissionDifficulty {
    return new IdentityAdmissionDifficulty(
      IdentityAdmissionProof.DIFFICULTY_BITS,
    );
  }

  public static max(): IdentityAdmissionDifficulty {
    return new IdentityAdmissionDifficulty(
      IdentityAdmissionDifficulty.MAX_BITS,
    );
  }

  /** Difficulty for a network that counted `recentAdmissions` admissions in the current window. */
  public static forRecentAdmissions(
    recentAdmissions: number,
  ): IdentityAdmissionDifficulty {
    const free = IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW;

    if (recentAdmissions < free) return IdentityAdmissionDifficulty.floor();

    const doublings = Math.floor(Math.log2(recentAdmissions / free));

    return new IdentityAdmissionDifficulty(
      Math.min(
        IdentityAdmissionDifficulty.MAX_BITS,
        IdentityAdmissionProof.DIFFICULTY_BITS + 1 + doublings,
      ),
    );
  }

  /** Whether an admission signed at `signedAt` is new as seen from a node clock at `now`. */
  public static isFreshAdmission(signedAt: Timestamp, now: Timestamp): boolean {
    return (
      Math.abs(now.valueOf() - signedAt.valueOf()) <=
      IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS
    );
  }

  private constructor(bits: number) {
    super(bits);
  }

  public hardest(
    other: IdentityAdmissionDifficulty,
  ): IdentityAdmissionDifficulty {
    return this.isGreaterOrEqualThan(other) ? this : other;
  }
}
