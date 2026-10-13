import { Integer } from '@haskou/value-objects';

import { IdentityAdmissionProof } from './IdentityAdmissionProof';

/**
 * Leading zero bits a node asks of an identity admission proof submitted
 * through its own API. The floor is the protocol constant every node checks on
 * every record, so validity converges across the network. Above it, a node
 * asks one more bit per doubling of the admissions it accepted into a network
 * in the current window beyond FREE_ADMISSIONS_PER_WINDOW, up to MAX_BITS. The
 * raised requirement is local admission policy, never a validity rule:
 * replicated records are still judged at the floor.
 */
export class IdentityAdmissionDifficulty extends Integer {
  public static readonly FREE_ADMISSIONS_PER_WINDOW = 60;
  public static readonly MAX_BITS = 20;

  public static floor(): IdentityAdmissionDifficulty {
    return new IdentityAdmissionDifficulty(
      IdentityAdmissionProof.DIFFICULTY_BITS,
    );
  }

  /** Difficulty for a network that took `recentAdmissions` admissions on this node in the current window. */
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

  private constructor(bits: number) {
    super(bits);
  }

  public hardest(
    other: IdentityAdmissionDifficulty,
  ): IdentityAdmissionDifficulty {
    return this.isGreaterOrEqualThan(other) ? this : other;
  }
}
