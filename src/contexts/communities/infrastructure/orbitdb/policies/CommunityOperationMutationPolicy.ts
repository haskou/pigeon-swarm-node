import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { assert } from '@haskou/value-objects';

import { InvalidCommunityOperationError } from '../../../domain/errors/InvalidCommunityOperationError';
import { CommunityOperation } from '../../../domain/operations/CommunityOperation';
import { CommunityOperationArgumentReader } from '../../../domain/operations/CommunityOperationArgumentReader';
import { CommunityOperationLedger } from '../../../domain/operations/CommunityOperationLedger';
import { CommunityJoinMethod } from '../../../domain/value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../../../domain/value-objects/CommunityOperationAction';
import { CommunityOperationPrimitives } from '../../../domain/operations/CommunityOperationPrimitives';

/**
 * Admits a signed community operation only when its author was permitted to
 * perform it in the history the operation builds on. Every admitted operation
 * is remembered here, so the parents of a replicated batch are found whatever
 * the order it arrives in; an operation whose parents (or whose join
 * reference) have not replicated yet is refused and retried by the registry.
 */
export default class CommunityOperationMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['action', 'authorIdentityId', 'communityId', 'id', 'networkId'],
    ['createdAt'],
    'community_operation',
    { arrays: ['parents'], objects: ['args'] },
  );

  private readonly ledgers = new Map<string, CommunityOperationLedger>();

  public readonly collection = 'communityOperations';

  public readonly scopeType = 'community_operation';

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private toOperation(record: Record<string, unknown>): CommunityOperation {
    try {
      return CommunityOperation.fromPrimitives(
        record as unknown as CommunityOperationPrimitives,
      );
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  private async findRequests(
    operation: CommunityOperation,
    ids: string[],
  ): Promise<Record<string, unknown>[]> {
    return this.registry.queryDocuments(
      'requests',
      (document) => typeof document.id === 'string' && ids.includes(document.id),
      [operation.getNetworkId().valueOf()],
    );
  }

  private async assertRequestAccepted(
    operation: CommunityOperation,
    method: CommunityJoinMethod,
    member: string,
    reference: string,
  ): Promise<void> {
    const [request] = await this.findRequests(operation, [reference]);

    assert(
      request?.scopeType === 'community_membership_request' &&
        request.communityId === operation.getCommunityId().valueOf() &&
        request.identityId === member &&
        request.status === 'accepted' &&
        request.type ===
          (method.isEqual(CommunityJoinMethod.INVITATION)
            ? 'invitation'
            : 'request'),
      new InvalidCommunityOperationError(),
    );
  }

  private async assertInviteRedeemed(
    operation: CommunityOperation,
    member: string,
    token: string,
  ): Promise<void> {
    const useId = `invite-use:${token}:${member}`;
    const records = await this.findRequests(operation, [token, useId]);
    const communityId = operation.getCommunityId().valueOf();

    assert(
      records.some(
        (record) =>
          record.scopeType === 'community_invite' &&
          record.id === token &&
          record.communityId === communityId,
      ) &&
        records.some(
          (record) =>
            record.scopeType === 'community_invite_use' &&
            record.id === useId &&
            record.token === token &&
            record.identityId === member &&
            record.communityId === communityId,
        ),
      new InvalidCommunityOperationError(),
    );
  }

  /** A join that needs a reference must point at the signed record allowing it. */
  private async assertJoinReference(
    operation: CommunityOperation,
  ): Promise<void> {
    if (!operation.getAction().isEqual(CommunityOperationAction.MEMBER_JOINED)) {
      return;
    }

    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['identityId', 'method'],
      ['reference'],
    );
    const method = new CommunityJoinMethod(reader.string('method'));
    const reference = reader.optionalString('reference');

    if (reference === undefined) return;

    if (method.isEqual(CommunityJoinMethod.INVITE_LINK)) {
      await this.assertInviteRedeemed(
        operation,
        reader.string('identityId'),
        reference,
      );

      return;
    }

    await this.assertRequestAccepted(
      operation,
      method,
      reader.string('identityId'),
      reference,
    );
  }

  private ledgerOf(operation: CommunityOperation): CommunityOperationLedger {
    const communityId = operation.getCommunityId().valueOf();
    const ledger = this.ledgers.get(communityId) ?? new CommunityOperationLedger();

    this.ledgers.set(communityId, ledger);

    return ledger;
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const operation = this.toOperation(record);

    return {
      authorIdentityId: operation.getAuthorIdentityId().valueOf(),
      recordId: operation.getId(),
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    _authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion) throw new InvalidPublicMutationError();

    const operation = this.toOperation(record);
    const ledger = this.ledgerOf(operation);

    if (ledger.has(operation)) return;

    await this.assertJoinReference(operation);
    ledger.admit(operation);
  }
}
