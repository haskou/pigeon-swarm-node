import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import PublicMutationVerifier, {
  PublicMutationExpectation,
} from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { OrbitDBReplicatedDocumentStoreName } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDocumentStoreName';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

/** Which stored records belong to one author, and how many may be admitted. */
export interface GenuineRecordQuotaRule {
  /** The payload field that names the author of a record of this kind. */
  authorField: string;
  expectationOf: (
    payload: Record<string, unknown>,
  ) => Omit<PublicMutationExpectation, 'payload'>;
  limit: number;
  scopeType: string;
}

/**
 * A retained-record quota per author, shared by the notification policies.
 *
 * Notification records carry no signed time and a node only sees them when
 * they reach it, so a per-minute window would admit different records on
 * different nodes. The quota is a pure function of the stored records
 * instead: the genuine records of one author are ordered by id and a record is
 * admitted while fewer than `limit` genuine ones sort before it. Every node
 * that holds the same set reaches the same verdict whatever order the records
 * arrived in.
 *
 * Only records whose proof verifies for their own payload count, so a forged
 * record cannot use up another identity's quota.
 */
export class GenuineRecordQuota {
  private static readonly MAX_VERIFIED_DIGESTS = 100_000;

  /** Proofs already verified while counting, keyed by proof and payload digest. */
  private readonly verifiedDigests = new Set<string>();

  constructor(
    private readonly collection: OrbitDBReplicatedDocumentStoreName,
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly verifier: PublicMutationVerifier,
  ) {}

  /**
   * The memo is keyed by proof and payload together, so a proof copied onto
   * another payload is verified again.
   */
  private async isGenuine(
    record: Record<string, unknown>,
    rule: GenuineRecordQuotaRule,
  ): Promise<boolean> {
    const proof = PublicMutationRecord.proofOf(record);

    if (!proof) return false;

    try {
      const payload = PublicMutationRecord.payloadOf(record);
      const expectation = rule.expectationOf(payload);
      const memo = `${proof.digest()}:${PublicMutationProof.digestOf(payload)}`;

      if (this.verifiedDigests.has(memo)) return true;

      await this.verifier.verify(proof, { ...expectation, payload });

      if (
        this.verifiedDigests.size >= GenuineRecordQuota.MAX_VERIFIED_DIGESTS
      ) {
        this.verifiedDigests.clear();
      }
      this.verifiedDigests.add(memo);

      return true;
    } catch {
      return false;
    }
  }

  /** Throws when `limit` genuine records of the author already sort before `record`. */
  public async assertWithin(
    record: Record<string, unknown>,
    rule: GenuineRecordQuotaRule,
  ): Promise<void> {
    const earlier = await this.registry.queryUnadmittedDocuments(
      this.collection,
      (document) =>
        document.scopeType === rule.scopeType &&
        document[rule.authorField] === record[rule.authorField] &&
        (document.id as string) < (record.id as string),
    );
    const counted = new Set<string>();

    if (earlier.length < rule.limit) return;

    for (const document of earlier) {
      const id = document.id as string;

      if (counted.has(id)) continue;

      if (await this.isGenuine(document, rule)) counted.add(id);

      if (counted.size >= rule.limit) throw new InvalidPublicMutationError();
    }
  }
}
