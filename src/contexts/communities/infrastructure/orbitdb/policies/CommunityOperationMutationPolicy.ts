import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityInvite } from '../../../domain/entities/invites/CommunityInvite';
import { InvalidCommunityOperationError } from '../../../domain/errors/InvalidCommunityOperationError';
import { CommunityOperation } from '../../../domain/operations/CommunityOperation';
import { CommunityOperationArgumentReader } from '../../../domain/operations/CommunityOperationArgumentReader';
import { CommunityOperationLedger } from '../../../domain/operations/CommunityOperationLedger';
import { CommunityInviteToken } from '../../../domain/value-objects/CommunityInviteToken';
import { CommunityJoinMethod } from '../../../domain/value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../../../domain/value-objects/CommunityOperationAction';

/**
 * Admits a signed community operation only when its author's identity key
 * signed it and the author was permitted to perform it in the history the
 * operation builds on. Every admitted operation is remembered here, so the
 * parents of a replicated batch are found whatever the order it arrives in; an
 * operation whose parents (or whose join reference) have not replicated yet is
 * refused and retried by the registry.
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

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

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

  private async findRequests(
    operation: CommunityOperation,
    ids: string[],
  ): Promise<Record<string, unknown>[]> {
    return this.registry.queryDocuments(
      'requests',
      (document) =>
        typeof document.id === 'string' && ids.includes(document.id),
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

  /**
   * An `invite_link` join signs the invite reference of the token, never the
   * token: the member's signed invite use names the token whose reference it
   * is, and that invite must belong to the same community and still be
   * redeemable when the join was signed. The token commits to the invite
   * limits, so no replicated record can rewrite them. maxUses is not
   * enforced here: concurrent joins have no single order to count them in,
   * and a cap on the folded history would let any token holder evict an
   * admitted member with a backdated join.
   */
  private async assertInviteRedeemed(
    operation: CommunityOperation,
    member: string,
    reference: string,
  ): Promise<void> {
    const communityId = operation.getCommunityId().valueOf();
    const records = await this.registry.queryDocuments(
      'requests',
      (document) =>
        document.communityId === communityId &&
        (document.scopeType === 'community_invite' ||
          (document.scopeType === 'community_invite_use' &&
            document.identityId === member)),
      [operation.getNetworkId().valueOf()],
    );
    const use = records.find(
      (record) =>
        record.scopeType === 'community_invite_use' &&
        record.communityId === communityId &&
        record.identityId === member &&
        typeof record.token === 'string' &&
        record.id === `invite-use:${record.token}:${member}` &&
        new CommunityInviteToken(record.token).toReference() === reference,
    );
    const record = records.find(
      (candidate) =>
        candidate.scopeType === 'community_invite' &&
        use !== undefined &&
        candidate.id === use.token &&
        candidate.communityId === communityId,
    );

    assert(record !== undefined, new InvalidCommunityOperationError());

    try {
      CommunityInvite.fromPrimitives(
        record as PrimitiveOf<CommunityInvite>,
      ).assertRedeemableAt(new Timestamp(operation.getCreatedAt()));
    } catch {
      throw new InvalidCommunityOperationError();
    }
  }

  /** A join that needs a reference must point at the signed record allowing it. */
  private async assertJoinReference(
    operation: CommunityOperation,
  ): Promise<void> {
    if (
      !operation.getAction().isEqual(CommunityOperationAction.MEMBER_JOINED)
    ) {
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
