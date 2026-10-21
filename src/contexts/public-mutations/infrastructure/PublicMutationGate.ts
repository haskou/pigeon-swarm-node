import {
  OrbitDBMutationGate,
  OrbitDBMutationVerdict,
} from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { DomainError } from '@haskou/value-objects';

import { PublicMutationPendingError } from '../domain/errors/PublicMutationPendingError';
import { PublicMutationProof } from '../domain/PublicMutationProof';
import { PublicMutationRecord } from '../domain/PublicMutationRecord';
import { PublicMutationPolicy } from '../domain/services/PublicMutationPolicy';
import PublicMutationVerifier from '../domain/services/PublicMutationVerifier';

/**
 * Admits a replicated record only with a valid, authorized, scoped proof.
 * A record that can never be valid is refused, and so is one its policy or
 * its author's authorization refuses. A record waiting on a parent that has
 * not arrived yet, or on an infrastructure failure, is held until judged.
 */
export class PublicMutationGate extends OrbitDBMutationGate {
  private readonly policies: Map<string, PublicMutationPolicy>;
  private readonly collections: Set<string>;

  /**
   * A refusal is a domain error about the record itself. A record that waits
   * on replicated state is pending, and so is anything the node itself failed
   * to judge, including a node that is still opening
   * (`ReplicatedStateNotReadyError`, which is not a domain error).
   */
  private static isRefusal(error: unknown): boolean {
    if (error instanceof ReplicatedStateNotReadyError) return false;

    return (
      error instanceof DomainError &&
      !(error instanceof PublicMutationPendingError)
    );
  }

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

  /** Checks that need no replicated state; `undefined` means the record can never be valid. */
  private intrinsicProof(
    policy: PublicMutationPolicy,
    record: Record<string, unknown>,
  ): PublicMutationProof | undefined {
    try {
      const proof = PublicMutationRecord.proofOf(record);
      const payload = PublicMutationRecord.payloadOf(record);

      if (!proof || proof.isDeletion() !== (payload.removed === true)) {
        return undefined;
      }

      const hasFrontier = proof.getBody().frontier !== undefined;

      if (policy.requiresFrontier !== hasFrontier) {
        return undefined;
      }

      this.verifier.assertIntrinsic(proof, {
        ...policy.expectationOf(payload),
        payload,
      });

      return proof;
    } catch {
      return undefined;
    }
  }

  public governs(collection: string): boolean {
    return this.collections.has(collection);
  }

  /** Public mutations are admitted per record; their heads are checked as records. */
  public governsHead(): boolean {
    return false;
  }

  public acceptsHead(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public async verdictOf(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<OrbitDBMutationVerdict> {
    if (!this.governs(collection)) return 'accepted';

    const policy = this.policies.get(
      PublicMutationGate.key(collection, record.scopeType),
    );

    if (!policy) return 'refused';

    const proof = this.intrinsicProof(policy, record);

    if (!proof) return 'refused';

    try {
      await this.verifier.assertAuthorized(proof);
      await policy.assertPermitted(
        PublicMutationRecord.payloadOf(record),
        proof.getAuthor().identityId,
        proof.isDeletion(),
        proof.getBody().frontier ?? [],
      );

      return 'accepted';
    } catch (error) {
      return PublicMutationGate.isRefusal(error) ? 'refused' : 'pending';
    }
  }
}
