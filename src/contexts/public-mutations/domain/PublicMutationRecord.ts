import { StalePublicMutationError } from './errors/StalePublicMutationError';
import { PublicMutationProof } from './PublicMutationProof';

/** Helpers for replicated records that embed their own mutation proof. */
export class PublicMutationRecord {
  public static readonly PROOF_FIELD = 'proof';

  /** The immutable fields that the proof commits to. */
  public static payloadOf(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => key !== PublicMutationRecord.PROOF_FIELD,
      ),
    );
  }

  public static proofOf(
    record: Record<string, unknown>,
  ): PublicMutationProof | undefined {
    if (!Object.hasOwn(record, PublicMutationRecord.PROOF_FIELD)) {
      return undefined;
    }

    try {
      return PublicMutationProof.fromPrimitives(
        record[PublicMutationRecord.PROOF_FIELD],
      );
    } catch {
      return undefined;
    }
  }

  public static withProof(
    payload: Record<string, unknown>,
    proof: PublicMutationProof,
  ): Record<string, unknown> {
    return {
      ...payload,
      [PublicMutationRecord.PROOF_FIELD]: proof.toPrimitives(),
    };
  }

  /**
   * Whether `candidate` may replace `current`. Undefined when neither record is
   * proof-carrying, so callers keep their legacy rule for ungoverned records.
   * A signed record always outranks an unsigned one.
   */
  public static replaces(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean | undefined {
    const currentProof = PublicMutationRecord.proofOf(current);
    const candidateProof = PublicMutationRecord.proofOf(candidate);

    if (!currentProof && !candidateProof) return undefined;

    if (!currentProof) return true;

    if (!candidateProof) return false;

    return !currentProof.winsOver(candidateProof);
  }

  /** Rejects a mutation that an already stored one outranks. */
  public static assertNotStale(
    stored: Record<string, unknown>[],
    candidate: Record<string, unknown>,
  ): void {
    const strongest = stored
      .map((record) => PublicMutationRecord.proofOf(record))
      .filter((proof): proof is PublicMutationProof => proof !== undefined)
      .reduce<PublicMutationProof | undefined>(
        (best, proof) => (!best || proof.winsOver(best) ? proof : best),
        undefined,
      );
    const proof = PublicMutationRecord.proofOf(candidate);

    if (strongest && proof && strongest.winsOver(proof)) {
      throw new StalePublicMutationError({
        digest: strongest.digest(),
        sequence: strongest.getBody().sequence,
      });
    }
  }
}
