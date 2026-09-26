import { AggregateRoot } from '@haskou/ddd-kernel/domain';

import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationConflictError } from './errors/PrivateAuthorizationConflictError';
import { PrivatePendingCapacityExceededError } from './errors/PrivatePendingCapacityExceededError';
import { PrivateAuthorizationScopeWasFrozenEvent } from './events/PrivateAuthorizationScopeWasFrozenEvent';
import { PrivateAuthorizationScopeWasPinnedEvent } from './events/PrivateAuthorizationScopeWasPinnedEvent';
import { PrivateControlOperationWasAcceptedEvent } from './events/PrivateControlOperationWasAcceptedEvent';
import { PrivateAuthorizationCheckpoint } from './PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScopePrimitives } from './PrivateAuthorizationScopePrimitives';
import { PrivateControlOperation } from './PrivateControlOperation';

export class PrivateAuthorizationScope extends AggregateRoot {
  private static readonly MAX_PENDING_BYTES = 1024 * 1024;
  private static readonly MAX_PENDING_OPERATIONS = 128;

  public static pin(
    checkpoint: PrivateAuthorizationCheckpoint,
    genesisHash: string,
  ): PrivateAuthorizationScope {
    const scope = new PrivateAuthorizationScope(
      checkpoint,
      genesisHash,
      'active',
      [],
      [],
    );
    scope.record(
      new PrivateAuthorizationScopeWasPinnedEvent(
        checkpoint.toPrimitives().scopeId,
      ),
    );

    return scope;
  }

  public static fromPrimitives(
    primitives: PrivateAuthorizationScopePrimitives,
  ): PrivateAuthorizationScope {
    return new PrivateAuthorizationScope(
      PrivateAuthorizationCheckpoint.fromPrimitives(primitives.checkpoint),
      primitives.genesisHash,
      primitives.status,
      primitives.acceptedOperations.map((operation) =>
        PrivateControlOperation.fromPrimitives(operation),
      ),
      primitives.pendingOperations.map((operation) =>
        PrivateControlOperation.fromPrimitives(operation),
      ),
    );
  }

  private constructor(
    private checkpoint: PrivateAuthorizationCheckpoint,
    private readonly genesisHash: string,
    private status: 'active' | 'frozen',
    private readonly acceptedOperations: PrivateControlOperation[],
    private readonly pendingOperations: PrivateControlOperation[],
  ) {
    super();
  }

  private accept(
    operation: PrivateControlOperation,
    expectedKind: string,
  ): 'accepted' | 'duplicate' | 'pending' {
    const assessment = this.assess(operation, expectedKind);

    if (assessment !== 'ready') return assessment;

    this.acceptNow(operation);

    return 'accepted';
  }

  private assertOperation(
    operation: PrivateControlOperation,
    expectedKind: string,
  ): void {
    const value = operation.toPrimitives();
    const checkpoint = this.checkpoint.toPrimitives();

    const checks = [
      Boolean(value.id),
      Boolean(value.digest),
      Boolean(value.authorDeviceKey),
      value.scopeId === checkpoint.scopeId,
      value.kind === expectedKind,
      Number.isSafeInteger(value.authorizationRevision),
      value.authorizationRevision >= checkpoint.revision,
      Number.isSafeInteger(value.byteSize),
      value.byteSize >= 0,
      checkpoint.admittedDeviceKeys.includes(value.authorDeviceKey),
      !checkpoint.revokedDeviceKeys.includes(value.authorDeviceKey),
      expectedKind !== 'membership.propose' ||
        value.authorizationRevision > checkpoint.revision ||
        value.control?.parentHeadHash === checkpoint.headHash,
    ];

    if (checks.includes(false)) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private assertSuccessor(candidate: PrivateAuthorizationCheckpoint): void {
    const current = this.checkpoint.toPrimitives();
    const next = candidate.toPrimitives();

    if (
      next.scopeId !== current.scopeId ||
      next.revision !== current.revision + 1 ||
      next.parentHeadHash !== current.headHash
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private isPending(operation: PrivateControlOperation): boolean {
    const value = operation.toPrimitives();
    const acceptedIds = new Set(
      this.acceptedOperations.map((accepted) => accepted.toPrimitives().id),
    );

    return (
      value.authorizationRevision > this.checkpoint.toPrimitives().revision ||
      value.previousOperationIds.some((id) => !acceptedIds.has(id))
    );
  }

  private enqueue(operation: PrivateControlOperation): void {
    const duplicate = this.pendingOperations.find(
      (pending) => pending.toPrimitives().id === operation.toPrimitives().id,
    );

    if (duplicate) {
      if (duplicate.toPrimitives().digest !== operation.toPrimitives().digest) {
        this.freeze();
      }

      return;
    }

    const byteSize = this.pendingOperations.reduce(
      (total, pending) => total + pending.toPrimitives().byteSize,
      0,
    );

    if (
      this.pendingOperations.length >=
        PrivateAuthorizationScope.MAX_PENDING_OPERATIONS ||
      byteSize + operation.toPrimitives().byteSize >
        PrivateAuthorizationScope.MAX_PENDING_BYTES
    ) {
      throw new PrivatePendingCapacityExceededError();
    }

    this.pendingOperations.push(operation);
  }

  private acceptNow(operation: PrivateControlOperation): void {
    const id = operation.toPrimitives().id;
    const pendingIndex = this.pendingOperations.findIndex(
      (pending) => pending.toPrimitives().id === id,
    );

    if (pendingIndex >= 0) this.pendingOperations.splice(pendingIndex, 1);
    this.acceptedOperations.push(operation);
    this.record(
      new PrivateControlOperationWasAcceptedEvent(
        this.checkpoint.toPrimitives().scopeId,
      ),
    );
  }

  private duplicateResult(
    operation: PrivateControlOperation,
  ): 'duplicate' | 'pending' | undefined {
    const candidate = operation.toPrimitives();
    const existing = [
      ...this.acceptedOperations,
      ...this.pendingOperations,
    ].find((stored) => stored.toPrimitives().id === candidate.id);

    if (!existing) return undefined;

    if (existing.toPrimitives().digest !== candidate.digest) this.freeze();

    return this.acceptedOperations.includes(existing) ? 'duplicate' : 'pending';
  }

  private assertActive(): void {
    if (this.status !== 'active') {
      throw new PrivateAuthorizationConflictError();
    }
  }

  private freeze(): never {
    if (this.status !== 'frozen') {
      this.status = 'frozen';
      this.record(
        new PrivateAuthorizationScopeWasFrozenEvent(
          this.checkpoint.toPrimitives().scopeId,
        ),
      );
    }

    throw new PrivateAuthorizationConflictError();
  }

  private equal(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  public pinGenesis(
    checkpoint: PrivateAuthorizationCheckpoint,
    genesisHash: string,
  ): void {
    if (
      this.genesisHash !== genesisHash ||
      !this.equal(this.checkpoint.toPrimitives(), checkpoint.toPrimitives())
    ) {
      this.freeze();
    }
  }

  public acceptProposal(
    operation: PrivateControlOperation,
  ): 'accepted' | 'duplicate' | 'pending' {
    return this.accept(operation, 'membership.propose');
  }

  public commitTransition(
    operation: PrivateControlOperation,
    candidate: PrivateAuthorizationCheckpoint,
  ): 'accepted' | 'duplicate' | 'pending' {
    const assessment = this.assess(operation, 'membership.commit');

    if (assessment !== 'ready') return assessment;
    const operationPrimitives = operation.toPrimitives();
    const proposal = this.acceptedOperations.find(
      (accepted) =>
        accepted.toPrimitives().id === operationPrimitives.proposalOperationId,
    );

    if (
      !proposal ||
      proposal.toPrimitives().kind !== 'membership.propose' ||
      !operationPrimitives.proposalOperationId ||
      !operationPrimitives.previousOperationIds.includes(
        operationPrimitives.proposalOperationId,
      ) ||
      !this.equal(
        proposal.toPrimitives().mutation,
        operationPrimitives.mutation,
      )
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    this.assertSuccessor(candidate);
    this.acceptNow(operation);
    this.checkpoint = candidate;

    return 'accepted';
  }

  public revokeDevice(
    operation: PrivateControlOperation,
    candidate: PrivateAuthorizationCheckpoint,
  ): 'accepted' | 'duplicate' | 'pending' {
    const assessment = this.assess(operation, 'device.revoke');

    if (assessment !== 'ready') return assessment;
    const mutation = operation.toPrimitives().mutation;
    const deviceKey =
      mutation.type === 'device.revoke' && 'deviceKey' in mutation
        ? mutation.deviceKey
        : undefined;
    const current = this.checkpoint.toPrimitives();
    const next = candidate.toPrimitives();

    if (
      typeof deviceKey !== 'string' ||
      !current.admittedDeviceKeys.includes(deviceKey) ||
      next.admittedDeviceKeys.includes(deviceKey) ||
      !next.revokedDeviceKeys.includes(deviceKey)
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    this.assertSuccessor(candidate);
    this.acceptNow(operation);
    this.checkpoint = candidate;

    return 'accepted';
  }

  public assess(
    operation: PrivateControlOperation,
    expectedKind: string = operation.toPrimitives().kind,
  ): 'duplicate' | 'pending' | 'ready' {
    const duplicate = this.duplicateResult(operation);

    if (duplicate === 'duplicate') return duplicate;
    this.assertActive();
    this.assertOperation(operation, expectedKind);

    if (duplicate === 'pending' && !this.isPending(operation)) {
      const operationId = operation.toPrimitives().id;
      const pendingIndex = this.pendingOperations.findIndex(
        (pending) => pending.toPrimitives().id === operationId,
      );
      this.pendingOperations.splice(pendingIndex, 1);
    } else if (duplicate === 'pending') {
      return duplicate;
    }

    if (this.isPending(operation)) {
      this.enqueue(operation);

      return 'pending';
    }

    return 'ready';
  }

  public quarantine(): void {
    if (this.status === 'frozen') return;
    this.status = 'frozen';
    this.record(
      new PrivateAuthorizationScopeWasFrozenEvent(
        this.checkpoint.toPrimitives().scopeId,
      ),
    );
  }

  public retryable(): PrivateControlOperation[] {
    const checkpoint = this.checkpoint.toPrimitives();
    const acceptedIds = new Set(
      this.acceptedOperations.map((operation) => operation.toPrimitives().id),
    );

    return this.pendingOperations
      .filter((operation) => {
        const value = operation.toPrimitives();

        return (
          value.authorizationRevision === checkpoint.revision &&
          checkpoint.admittedDeviceKeys.includes(value.authorDeviceKey) &&
          !checkpoint.revokedDeviceKeys.includes(value.authorDeviceKey) &&
          value.previousOperationIds.every((id) => acceptedIds.has(id))
        );
      })
      .sort((left, right) =>
        left.toPrimitives().id.localeCompare(right.toPrimitives().id),
      );
  }

  public toPrimitives(): PrivateAuthorizationScopePrimitives {
    return {
      acceptedOperations: this.acceptedOperations.map((operation) =>
        operation.toPrimitives(),
      ),
      checkpoint: this.checkpoint.toPrimitives(),
      genesisHash: this.genesisHash,
      pendingOperations: this.pendingOperations.map((operation) =>
        operation.toPrimitives(),
      ),
      status: this.status,
    };
  }
}
