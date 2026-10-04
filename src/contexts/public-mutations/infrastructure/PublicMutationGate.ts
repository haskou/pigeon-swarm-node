import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';

import { InvalidPublicMutationError } from '../domain/errors/InvalidPublicMutationError';
import { PublicMutationRecord } from '../domain/PublicMutationRecord';
import { PublicMutationPolicy } from '../domain/services/PublicMutationPolicy';
import PublicMutationVerifier from '../domain/services/PublicMutationVerifier';

/** Admits a replicated record only with a valid, authorized, scoped proof. */
export class PublicMutationGate extends OrbitDBMutationGate {
  private readonly policies: Map<string, PublicMutationPolicy>;
  private readonly collections: Set<string>;

  private static key(collection: string, scopeType: unknown): string {
    return `${collection}\n${String(scopeType)}`;
  }

  constructor(
    private readonly verifier: PublicMutationVerifier,
    policies: PublicMutationPolicy[],
  ) {
    super();
    this.policies = new Map(
      policies.map((policy) => [
        PublicMutationGate.key(policy.collection, policy.scopeType),
        policy,
      ]),
    );
    this.collections = new Set(policies.map((policy) => policy.collection));
  }

  public governs(collection: string): boolean {
    return this.collections.has(collection);
  }

  public async accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.governs(collection)) return true;

    try {
      const policy = this.policies.get(
        PublicMutationGate.key(collection, record.scopeType),
      );

      if (!policy) return false;
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
