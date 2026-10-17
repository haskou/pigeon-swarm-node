import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import { CommunityOperation } from '../../../domain/operations/CommunityOperation';
import { CommunityOperationLedger } from '../../../domain/operations/CommunityOperationLedger';

/**
 * Admits a signed community operation only when its author's identity key
 * signed it and the author was permitted to perform it in the history the
 * operation builds on. Every admitted operation is remembered here, so the
 * parents of a replicated batch are found whatever the order it arrives in; an
 * operation whose parents have not replicated yet is refused and retried by
 * the registry.
 */
export default class CommunityOperationMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    [
      'action',
      'authorIdentityId',
      'communityId',
      'id',
      'identitySignature',
      'networkId',
    ],
    ['createdAt'],
    'community_operation',
    { arrays: ['parents'], objects: ['args'] },
  );

  private readonly ledgers = new Map<string, CommunityOperationLedger>();

  public readonly collection = 'communityOperations';

  public readonly scopeType = 'community_operation';

  private toOperation(record: Record<string, unknown>): CommunityOperation {
    try {
      return CommunityOperation.fromPrimitives(record);
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  private assertIdentitySigned(operation: CommunityOperation): void {
    try {
      operation.assertIdentitySigned();
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  private ledgerOf(operation: CommunityOperation): CommunityOperationLedger {
    const communityId = operation.getCommunityId().valueOf();
    const ledger =
      this.ledgers.get(communityId) ?? new CommunityOperationLedger();

    this.ledgers.set(communityId, ledger);

    return ledger;
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const operation = this.toOperation(record);

    this.assertIdentitySigned(operation);

    return {
      authorIdentityId: operation.getAuthorIdentityId().valueOf(),
      recordId: operation.getId(),
      store: this.collection,
    };
  }

  /** Admission needs no lookup: the ledger holds every operation it judges. */
  public assertPermitted(
    record: Record<string, unknown>,
    _authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    try {
      if (isDeletion) throw new InvalidPublicMutationError();

      const operation = this.toOperation(record);

      this.ledgerOf(operation).admit(operation);

      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
