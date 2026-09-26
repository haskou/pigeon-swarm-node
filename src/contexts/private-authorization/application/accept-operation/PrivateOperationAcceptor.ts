import { InvalidPrivateAuthorizationError } from '../../domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationConflictError } from '../../domain/errors/PrivateAuthorizationConflictError';
import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';
import { PrivateAuthorizationRepository } from '../../domain/repositories/PrivateAuthorizationRepository';
import { PrivateOperationAcceptance } from '../PrivateOperationAcceptance';
import { PrivateOperationUnitOfWork } from '../PrivateOperationUnitOfWork';
import { PrivateOperationAcceptMessage } from './messages/PrivateOperationAcceptMessage';
import { PrivateControlMutationAuthorizer } from './PrivateControlMutationAuthorizer';
import { PrivateControlTransitionProcessor } from './PrivateControlTransitionProcessor';
import { PrivateFreshnessGate } from './PrivateFreshnessGate';
import { PrivateOperationAcceptanceResult } from './PrivateOperationAcceptanceResult';
import { PrivateOperationAuthenticator } from './PrivateOperationAuthenticator';
import { PrivateOperationDecoder } from './PrivateOperationDecoder';

export default class PrivateOperationAcceptor {
  public constructor(
    private readonly repository: PrivateAuthorizationRepository,
    private readonly unitOfWork: PrivateOperationUnitOfWork,
    private readonly operationVerifier: PrivateOperationAuthenticator,
    private readonly contract: PrivateOperationDecoder,
    private readonly freshness: PrivateFreshnessGate,
    private readonly transitions: PrivateControlTransitionProcessor,
    private readonly mutations: PrivateControlMutationAuthorizer,
  ) {}

  private expectedCheckpoint(checkpoint: PrivateAuthorizationCheckpoint) {
    const value = checkpoint.toPrimitives();

    return { headHash: value.headHash, revision: value.revision };
  }

  private async verifiedOperation(
    message: PrivateOperationAcceptMessage,
  ): Promise<{
    operation: PrivateControlOperation;
    scope: PrivateAuthorizationScope;
  }> {
    const routed = this.contract.decode(message.signedOperationJson);
    const routedValue = routed.toPrimitives();
    const scope = await this.repository.findScope(routedValue.scopeId);

    if (!scope) throw new InvalidPrivateAuthorizationError();
    const checkpoint = scope.toPrimitives().checkpoint;
    const expectedAuthor = checkpoint.admittedDeviceKeys.find(
      (key) => key === routedValue.authorDeviceKey,
    );

    if (
      !expectedAuthor ||
      checkpoint.revokedDeviceKeys.includes(expectedAuthor)
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    try {
      const canonical = this.operationVerifier.verify(
        message.signedOperationJson,
        expectedAuthor,
      );
      const operation = this.contract.decode(canonical);

      if (operation.toPrimitives().scopeId !== checkpoint.scopeId) {
        throw new InvalidPrivateAuthorizationError();
      }

      return { operation, scope };
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private async duplicate(
    scope: PrivateAuthorizationScope,
    operation: PrivateControlOperation,
  ): Promise<boolean> {
    const value = operation.toPrimitives();
    const receipt = await this.repository.findReceipt(value.scopeId, value.id);

    if (!receipt) return false;

    if (receipt.digest === value.digest) return true;
    scope.quarantine();
    await this.repository.saveScope(scope);
    throw new PrivateAuthorizationConflictError();
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
        childHeadHash: candidate.headHash,
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
    const projection = await this.mutations.apply(
      currentCheckpoint,
      value.mutation,
      currentProjection,
    );

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

  public async accept(
    message: PrivateOperationAcceptMessage,
  ): Promise<PrivateOperationAcceptanceResult> {
    const { operation, scope } = await this.verifiedOperation(message);
    const value = operation.toPrimitives();

    if (await this.duplicate(scope, operation)) return { status: 'duplicate' };
    const checkpoint = PrivateAuthorizationCheckpoint.fromPrimitives(
      scope.toPrimitives().checkpoint,
    );
    const freshness = await this.freshness.verify(
      checkpoint,
      operation,
      message.signedFreshnessProofJson,
    );
    const assessment = scope.assess(operation);

    if (assessment === 'duplicate') return { status: 'duplicate' };

    if (assessment === 'pending') {
      await this.repository.saveScope(scope);

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
}
