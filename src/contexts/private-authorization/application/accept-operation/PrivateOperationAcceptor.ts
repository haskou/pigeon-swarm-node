import { assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from '../../domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationConflictError } from '../../domain/errors/PrivateAuthorizationConflictError';
import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';
import { PrivateControlTransitionReservation } from '../../domain/PrivateControlTransitionReservation';
import { PrivateAuthorizationRepository } from '../../domain/repositories/PrivateAuthorizationRepository';
import { AuthenticatedPrivateOperationJson } from '../../domain/value-objects/AuthenticatedPrivateOperationJson';
import { PrivateProtectedMlsState } from '../../domain/value-objects/PrivateProtectedMlsState';
import { PrivateOperationAcceptance } from '../PrivateOperationAcceptance';
import { PrivateOperationUnitOfWork } from '../PrivateOperationUnitOfWork';
import { PrivateControlFrame } from './messages/PrivateControlFrame';
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

  private async reserveControlChild(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    authenticatedOperation: AuthenticatedPrivateOperationJson,
    controlFrame?: PrivateControlFrame,
  ): Promise<void> {
    if (!operation.isControlChildOf(checkpoint)) return;
    await this.transition(
      controlFrame,
      checkpoint,
      operation,
      authenticatedOperation,
    );
    const result = await this.unitOfWork.reserveChild(
      PrivateControlTransitionReservation.forOperation(checkpoint, operation),
    );

    assert(result !== 'conflict', new PrivateAuthorizationConflictError());
  }

  private async applyMutation(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    projection: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.mutations.apply(checkpoint, operation, projection);
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
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

  private async historicalReservation(
    operation: PrivateControlOperation,
    checkpoint: PrivateAuthorizationCheckpoint,
  ): Promise<PrivateControlTransitionReservation | undefined> {
    const revision = operation.getAuthorizationRevision();

    if (!revision.isLessThan(checkpoint.getRevision())) return undefined;

    return this.repository.findReservationAtRevision(
      operation.getScopeId(),
      revision,
    );
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
        parentCheckpoint: reservation.getParentCheckpoint().toPrimitives(),
      }),
    );
  }

  private async rejectHistoricalReservationConflict(
    message: PrivateOperationAcceptMessage,
    reservation: PrivateControlTransitionReservation | undefined,
    operation: PrivateControlOperation,
    authenticatedOperation: AuthenticatedPrivateOperationJson,
  ): Promise<never> {
    assert(
      reservation && message.controlFrame,
      new InvalidPrivateAuthorizationError(),
    );
    await this.transitions.verify(
      reservation.getParentCheckpoint(),
      operation,
      authenticatedOperation,
      message.controlFrame,
    );
    await this.unitOfWork.quarantine(operation.toPrimitives().scopeId);

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
    const checkpoint = scope.getCheckpoint();
    const reservedChild = await this.historicalReservation(routed, checkpoint);
    const candidateHead = value.control?.resultingHeadHash;
    const conflict = this.reservationConflict(
      reservedChild,
      candidateHead,
      value.id,
      value.authorDeviceKey,
    );

    if (conflict === 'none') return;
    const authorized = await this.authorizer.authorizeHistorical(
      message.signedOperationJson,
      routed,
      reservedChild.getParentCheckpoint(),
    );
    await this.rejectHistoricalReservationConflict(
      message,
      reservedChild,
      authorized.operation,
      authorized.authenticatedOperation,
    );
  }

  private async transition(
    controlFrame: PrivateControlFrame | undefined,
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    authenticatedOperation: AuthenticatedPrivateOperationJson,
  ) {
    assert(controlFrame, new InvalidPrivateAuthorizationError());
    const scopeId = checkpoint.toPrimitives().scopeId;
    const protectedState = await this.repository.findProtectedMlsState(scopeId);

    assert(protectedState, new InvalidPrivateAuthorizationError());
    new PrivateProtectedMlsState(protectedState);

    return this.transitions.verify(
      checkpoint,
      operation,
      authenticatedOperation,
      controlFrame,
    );
  }

  private async acceptance(
    message: PrivateOperationAcceptMessage,
    scope: PrivateAuthorizationScope,
    operation: PrivateControlOperation,
    authenticatedOperation: AuthenticatedPrivateOperationJson,
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
        message.controlFrame,
        currentCheckpoint,
        operation,
        authenticatedOperation,
      );
      protectedMlsState = verified.protectedMlsState;
      const candidate = verified.checkpoint.toPrimitives();
      reservation = {
        authorDeviceKey: value.authorDeviceKey,
        childHeadHash: candidate.headHash,
        operationId: value.id,
        parentCheckpoint: currentCheckpoint.toPrimitives(),
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
    const candidateProjection = await this.applyMutation(
      currentCheckpoint,
      operation,
      currentProjection,
    );
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
    const { authenticatedOperation, operation, scope } = authorized;
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
      authenticatedOperation,
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
    const { authenticatedOperation, operation, scope } =
      await this.authorizer.authorize(message.signedOperationJson);
    this.authorizer.assertAuthoredBy(
      operation,
      message.authenticatedIdentityId,
    );
    scope.assertAcceptingOperations();
    const checkpoint = PrivateAuthorizationCheckpoint.fromPrimitives(
      scope.toPrimitives().checkpoint,
    );

    const projection =
      (await this.repository.findProjection(
        operation.getScopeId().valueOf(),
      )) ?? {};

    await this.applyMutation(checkpoint, operation, projection);

    await this.reserveControlChild(
      checkpoint,
      operation,
      authenticatedOperation,
      message.controlFrame,
    );

    return this.freshness.issue(checkpoint, operation);
  }
}
