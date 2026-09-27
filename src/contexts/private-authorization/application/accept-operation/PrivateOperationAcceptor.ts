import { assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from '../../domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationConflictError } from '../../domain/errors/PrivateAuthorizationConflictError';
import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';
import { PrivateControlTransitionReservation } from '../../domain/PrivateControlTransitionReservation';
import { PrivateAuthorizationRepository } from '../../domain/repositories/PrivateAuthorizationRepository';
import { PrivateOperationAcceptance } from '../PrivateOperationAcceptance';
import { PrivateOperationUnitOfWork } from '../PrivateOperationUnitOfWork';
import { PrivateOperationAcceptMessage } from './messages/PrivateOperationAcceptMessage';
import { PrivateOperationChallengeMessage } from './messages/PrivateOperationChallengeMessage';
import { PrivateControlMutationAuthorizer } from './PrivateControlMutationAuthorizer';
import { PrivateControlTransitionProcessor } from './PrivateControlTransitionProcessor';
import { PrivateFreshnessGate } from './PrivateFreshnessGate';
import { PrivateOperationAcceptanceResult } from './PrivateOperationAcceptanceResult';
import PrivateOperationAuthorizer from './PrivateOperationAuthorizer';

export default class PrivateOperationAcceptor {
  public constructor(
    private readonly repository: PrivateAuthorizationRepository,
    private readonly unitOfWork: PrivateOperationUnitOfWork,
    private readonly authorizer: PrivateOperationAuthorizer,
    private readonly freshness: PrivateFreshnessGate,
    private readonly transitions: PrivateControlTransitionProcessor,
    private readonly mutations: PrivateControlMutationAuthorizer,
  ) {}

  private expectedCheckpoint(checkpoint: PrivateAuthorizationCheckpoint) {
    const value = checkpoint.toPrimitives();

    return { headHash: value.headHash, revision: value.revision };
  }

  private async duplicate(
    operation: PrivateControlOperation,
  ): Promise<boolean> {
    const value = operation.toPrimitives();
    const receipt = await this.repository.findReceipt(value.scopeId, value.id);

    if (!receipt) return false;
    const committed = PrivateControlOperation.fromPrimitives(receipt);

    assert(
      committed.isAuthoredBy(operation.getAuthorDeviceKey()),
      new InvalidPrivateAuthorizationError(),
    );

    if (committed.hasSameDigestAs(operation)) return true;
    await this.unitOfWork.quarantine(value.scopeId);
    throw new PrivateAuthorizationConflictError();
  }

  private async hasReceipt(
    message: PrivateOperationAcceptMessage,
    routed: PrivateControlOperation,
  ): Promise<boolean> {
    const value = routed.toPrimitives();
    const receipt = await this.repository.findReceipt(value.scopeId, value.id);

    if (!receipt) return false;

    const committed = PrivateControlOperation.fromPrimitives(receipt);

    if (committed.hasSameDigestAs(routed)) return true;

    await this.authorizer.authorizeReceiptConflict(
      message.signedOperationJson,
      routed,
      committed,
    );
    await this.unitOfWork.quarantine(value.scopeId);
    throw new PrivateAuthorizationConflictError();
  }

  private historicalParent(
    operation: PrivateControlOperation,
    checkpoint: ReturnType<PrivateAuthorizationCheckpoint['toPrimitives']>,
  ): string | null {
    return operation.toPrimitives().authorizationRevision ===
      checkpoint.revision - 1
      ? checkpoint.parentHeadHash
      : null;
  }

  private reservationConflict(
    reservation: PrivateControlTransitionReservation | undefined,
    candidateHead: unknown,
    operationId: string,
    authorDeviceKey: string,
  ): 'head' | 'none' | 'operation' {
    if (!reservation || typeof candidateHead !== 'string') return 'none';

    return reservation.conflictWith(
      PrivateControlTransitionReservation.fromPrimitives({
        authorDeviceKey,
        childHeadHash: candidateHead,
        operationId,
      }),
    );
  }

  private async rejectHistoricalReservationConflict(
    conflict: 'head' | 'operation',
    reservation: PrivateControlTransitionReservation | undefined,
    operation: PrivateControlOperation,
  ): Promise<never> {
    if (conflict === 'operation') {
      assert(
        reservation?.isAuthoredBy(operation.getAuthorDeviceKey()),
        new InvalidPrivateAuthorizationError(),
      );
      await this.unitOfWork.quarantine(operation.toPrimitives().scopeId);
    }

    throw new PrivateAuthorizationConflictError();
  }

  private async rejectReservedSibling(
    message: PrivateOperationAcceptMessage,
    routed: PrivateControlOperation,
  ): Promise<void> {
    const value = routed.toPrimitives();

    if (value.kind === 'membership.propose') return;
    const scope = await this.repository.findScope(value.scopeId);

    if (!scope) return;
    const checkpoint = scope.toPrimitives().checkpoint;
    const parentHead = this.historicalParent(routed, checkpoint);

    if (!parentHead) return;
    const reservedChild = await this.repository.findReservation(
      value.scopeId,
      parentHead,
    );
    const candidateHead = value.control?.resultingHeadHash;
    const conflict = this.reservationConflict(
      reservedChild,
      candidateHead,
      value.id,
      value.authorDeviceKey,
    );

    if (conflict === 'none') return;
    await this.authorizer.authorizeHistorical(
      message.signedOperationJson,
      routed,
    );
    await this.rejectHistoricalReservationConflict(
      conflict,
      reservedChild,
      routed,
    );
  }

  private async transition(
    message: PrivateOperationAcceptMessage,
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
  ) {
    if (!message.controlFrame) throw new InvalidPrivateAuthorizationError();
    const scopeId = checkpoint.toPrimitives().scopeId;
    const protectedState = await this.repository.findProtectedMlsState(scopeId);

    if (!protectedState) throw new InvalidPrivateAuthorizationError();

    return this.transitions.verify(
      checkpoint,
      operation,
      message.controlFrame,
      protectedState,
    );
  }

  private async acceptance(
    message: PrivateOperationAcceptMessage,
    scope: PrivateAuthorizationScope,
    operation: PrivateControlOperation,
    replayMarkerId: string,
  ): Promise<PrivateOperationAcceptance> {
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives(
      scope.toPrimitives().checkpoint,
    );
    const value = operation.toPrimitives();
    let protectedMlsState: string | undefined;
    let reservation: PrivateOperationAcceptance['reservation'];
    let result: 'accepted' | 'duplicate' | 'pending';

    if (value.kind === 'membership.propose') {
      result = scope.acceptProposal(operation);
    } else {
      const verified = await this.transition(
        message,
        currentCheckpoint,
        operation,
      );
      protectedMlsState = verified.protectedMlsState;
      const candidate = verified.checkpoint.toPrimitives();
      reservation = {
        authorDeviceKey: value.authorDeviceKey,
        childHeadHash: candidate.headHash,
        operationId: value.id,
        parentHeadHash: currentCheckpoint.toPrimitives().headHash,
      };
      result =
        value.kind === 'membership.commit'
          ? scope.commitTransition(operation, verified.checkpoint)
          : scope.revokeDevice(operation, verified.checkpoint);
    }

    if (result !== 'accepted') throw new InvalidPrivateAuthorizationError();
    const currentProjection =
      (await this.repository.findProjection(value.scopeId)) ?? {};
    let candidateProjection: Record<string, unknown>;

    try {
      candidateProjection = await this.mutations.apply(
        currentCheckpoint,
        operation,
        currentProjection,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
    const projection =
      value.kind === 'membership.propose'
        ? currentProjection
        : candidateProjection;

    return {
      clearPendingOperationIds: [value.id],
      outbox: {
        eventName: 'private_authorization.v1.control_operation.was_accepted',
        id: value.id,
        payload: {},
      },
      projection,
      protectedMlsState,
      receipt: operation,
      replayMarkerId,
      reservation,
      scope,
    };
  }

  private async authorizeCurrentOrReceipt(
    message: PrivateOperationAcceptMessage,
    routed: PrivateControlOperation,
  ): Promise<
    Awaited<ReturnType<PrivateOperationAuthorizer['authorize']>> | undefined
  > {
    try {
      return await this.authorizer.authorize(
        message.signedOperationJson,
        routed,
      );
    } catch (error) {
      if (await this.hasReceipt(message, routed)) return undefined;

      throw error;
    }
  }

  private async acceptAuthorizedOperation(
    message: PrivateOperationAcceptMessage,
    authorized: Awaited<ReturnType<PrivateOperationAuthorizer['authorize']>>,
  ): Promise<PrivateOperationAcceptanceResult> {
    const { operation, scope } = authorized;
    const value = operation.toPrimitives();

    if (await this.duplicate(operation)) return { status: 'duplicate' };
    const checkpoint = PrivateAuthorizationCheckpoint.fromPrimitives(
      scope.toPrimitives().checkpoint,
    );
    const freshness = await this.freshness.verify(
      checkpoint,
      operation,
      message.signedFreshnessProofJson,
    );
    let assessment: ReturnType<PrivateAuthorizationScope['assess']>;

    try {
      assessment = scope.assess(operation);
    } catch (error) {
      if (error instanceof PrivateAuthorizationConflictError) {
        await this.unitOfWork.quarantine(value.scopeId);
      }

      throw error;
    }

    if (assessment === 'duplicate') return { status: 'duplicate' };

    if (assessment === 'pending') {
      const committed = await this.unitOfWork.commitPending(
        value.scopeId,
        this.expectedCheckpoint(checkpoint),
        operation,
      );

      if (committed !== 'committed') {
        throw new InvalidPrivateAuthorizationError();
      }

      return { status: 'pending' };
    }
    const expected = this.expectedCheckpoint(checkpoint);
    const acceptance = await this.acceptance(
      message,
      scope,
      operation,
      freshness.replayMarkerId,
    );
    const committed = await this.unitOfWork.commitAcceptance(
      value.scopeId,
      expected,
      acceptance,
    );

    if (committed !== 'committed') {
      throw new InvalidPrivateAuthorizationError();
    }

    return { status: 'accepted' };
  }

  private async acceptNewOperation(
    message: PrivateOperationAcceptMessage,
    routed: PrivateControlOperation,
  ): Promise<PrivateOperationAcceptanceResult> {
    const authorized = await this.authorizeCurrentOrReceipt(message, routed);

    return authorized
      ? this.acceptAuthorizedOperation(message, authorized)
      : { status: 'duplicate' };
  }

  public async accept(
    message: PrivateOperationAcceptMessage,
  ): Promise<PrivateOperationAcceptanceResult> {
    const routed = this.authorizer.decode(message.signedOperationJson);

    if (await this.hasReceipt(message, routed)) return { status: 'duplicate' };
    await this.rejectReservedSibling(message, routed);

    return this.acceptNewOperation(message, routed);
  }

  public async challenge(
    message: PrivateOperationChallengeMessage,
  ): Promise<string> {
    const { operation, scope } = await this.authorizer.authorize(
      message.signedOperationJson,
    );
    this.authorizer.assertAuthoredBy(
      operation,
      message.authenticatedIdentityId,
    );
    const checkpoint = PrivateAuthorizationCheckpoint.fromPrimitives(
      scope.toPrimitives().checkpoint,
    );

    return this.freshness.issue(checkpoint, operation);
  }
}
