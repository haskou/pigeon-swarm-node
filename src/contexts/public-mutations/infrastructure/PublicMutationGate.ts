import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';

import { InvalidPublicMutationError } from '../domain/errors/InvalidPublicMutationError';
import { PublicMutationRecord } from '../domain/PublicMutationRecord';
import { PublicMutationPolicy } from '../domain/services/PublicMutationPolicy';
import PublicMutationVerifier from '../domain/services/PublicMutationVerifier';

/** Admits a replicated record only with a valid, authorized, scoped proof. */
export class PublicMutationGate extends OrbitDBMutationGate {
  private readonly policies: Map<string, PublicMutationPolicy>;

  constructor(
    private readonly verifier: PublicMutationVerifier,
    policies: PublicMutationPolicy[],
  ) {
    super();
    this.policies = new Map(
      policies.map((policy) => [policy.collection, policy]),
    );
  }

  public governs(collection: string): boolean {
    return this.policies.has(collection);
  }

  public async accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    const policy = this.policies.get(collection);

    if (!policy) return true;

    try {
      await this.assertAccepted(policy, record);

      return true;
    } catch {
      return false;
    }
  }

  /** Throws when the record is not an authentic, permitted mutation. */
  public async assertAccepted(
    policy: PublicMutationPolicy,
    record: Record<string, unknown>,
  ): Promise<void> {
    const proof = PublicMutationRecord.proofOf(record);
    const payload = PublicMutationRecord.payloadOf(record);

    if (!proof || proof.isDeletion() !== (payload.removed === true)) {
      throw new InvalidPublicMutationError();
    }

    await this.verifier.verify(proof, {
      ...policy.expectationOf(payload),
      payload,
    });
    await policy.assertPermitted(
      payload,
      proof.getAuthor().identityId,
      proof.isDeletion(),
    );
  }
}
