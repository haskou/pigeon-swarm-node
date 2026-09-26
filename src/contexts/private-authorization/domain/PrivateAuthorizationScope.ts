import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateAcceptedCapacityExceededError } from './errors/PrivateAcceptedCapacityExceededError';
import { PrivateAuthorizationConflictError } from './errors/PrivateAuthorizationConflictError';
import { PrivatePendingCapacityExceededError } from './errors/PrivatePendingCapacityExceededError';
import { PrivateAuthorizationScopeWasFrozenEvent } from './events/PrivateAuthorizationScopeWasFrozenEvent';
import { PrivateAuthorizationScopeWasPinnedEvent } from './events/PrivateAuthorizationScopeWasPinnedEvent';
import { PrivateControlOperationWasAcceptedEvent } from './events/PrivateControlOperationWasAcceptedEvent';
import { PrivateAuthorizationCheckpoint } from './PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScopePrimitives } from './PrivateAuthorizationScopePrimitives';
import { PrivateControlOperation } from './PrivateControlOperation';

export class PrivateAuthorizationScope extends AggregateRoot {
  private static readonly MAX_ACCEPTED_BYTES = 4 * 1024 * 1024;
  private static readonly MAX_ACCEPTED_BYTES_PER_AUTHOR = 512 * 1024;
  private static readonly MAX_ACCEPTED_OPERATIONS = 128;
  private static readonly MAX_ACCEPTED_OPERATIONS_PER_AUTHOR = 8;
  private static readonly MAX_NON_AUTHORITY_ACCEPTED_BYTES = 3 * 1024 * 1024;
  private static readonly MAX_NON_AUTHORITY_ACCEPTED_OPERATIONS = 96;
  private static readonly MAX_HISTORICAL_OPERATIONS = 32;
  private static readonly MAX_PENDING_BYTES = 1024 * 1024;
  private static readonly MAX_PENDING_BYTES_PER_AUTHOR = 768 * 1024;
  private static readonly MAX_PENDING_OPERATIONS = 128;
  private static readonly MAX_PENDING_OPERATIONS_PER_AUTHOR = 96;

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
    this.compactAccepted();
  }

  private operationBytes(operations: PrivateControlOperation[]): number {
    let bytes = 0;

    for (const operation of operations) {
      bytes += operation.toPrimitives().byteSize;
    }

    return bytes;
  }

  private retainedAccepted(
    acceptedOperations: PrivateControlOperation[],
    pendingOperations: PrivateControlOperation[],
    checkpoint: PrivateAuthorizationCheckpoint,
  ): PrivateControlOperation[] {
    const revision = checkpoint.toPrimitives().revision;
    const dependencyIds = new Set(
      pendingOperations.flatMap((pending) => {
        const value = pending.toPrimitives();

        return [
          ...value.previousOperationIds,
          ...(value.proposalOperationId ? [value.proposalOperationId] : []),
        ];
      }),
    );
    const requiredIds = new Set(
      acceptedOperations
        .filter((operation) => {
          const value = operation.toPrimitives();

          return (
            value.authorizationRevision === revision ||
            dependencyIds.has(value.id)
          );
        })
        .map((operation) => operation.toPrimitives().id),
    );
    const required = acceptedOperations.filter((operation) =>
      requiredIds.has(operation.toPrimitives().id),
    );

    if (
      required.length > PrivateAuthorizationScope.MAX_ACCEPTED_OPERATIONS ||
      this.operationBytes(required) >
        PrivateAuthorizationScope.MAX_ACCEPTED_BYTES
    ) {
      throw new PrivateAcceptedCapacityExceededError();
    }

    const retainedIds = new Set(requiredIds);
    let retainedBytes = this.operationBytes(required);
    let historicalCount = 0;

    for (let index = acceptedOperations.length - 1; index >= 0; index -= 1) {
      const operation = acceptedOperations[index];
      const value = operation.toPrimitives();

      if (retainedIds.has(value.id)) continue;

      if (
        historicalCount >=
          PrivateAuthorizationScope.MAX_HISTORICAL_OPERATIONS ||
        retainedIds.size >= PrivateAuthorizationScope.MAX_ACCEPTED_OPERATIONS ||
        retainedBytes + value.byteSize >
          PrivateAuthorizationScope.MAX_ACCEPTED_BYTES
      ) {
        continue;
      }

      retainedIds.add(value.id);
      retainedBytes += value.byteSize;
      historicalCount += 1;
    }

    return acceptedOperations.filter((operation) =>
      retainedIds.has(operation.toPrimitives().id),
    );
  }

  private compactAccepted(): void {
    const pending = this.pendingOperations.filter(
      (operation) => !this.isPermanentlyInvalidPending(operation),
    );
    const retained = this.retainedAccepted(
      this.acceptedOperations,
      pending,
      this.checkpoint,
    );
    this.acceptedOperations.splice(
      0,
      this.acceptedOperations.length,
      ...retained,
    );
  }

  private assertAcceptedCapacity(
    operation: PrivateControlOperation,
    checkpoint: PrivateAuthorizationCheckpoint = this.checkpoint,
  ): void {
    const value = operation.toPrimitives();
    const operationId = value.id;
    const pending = this.pendingOperations.filter(
      (candidate) =>
        candidate.toPrimitives().id !== operationId &&
        !this.isPermanentlyInvalidPending(candidate, checkpoint),
    );

    if (value.authorizationRevision === checkpoint.toPrimitives().revision) {
      const current = this.acceptedOperations.filter(
        (accepted) =>
          accepted.toPrimitives().authorizationRevision ===
          checkpoint.toPrimitives().revision,
      );
      const byAuthor = current.filter(
        (accepted) =>
          accepted.toPrimitives().authorDeviceKey === value.authorDeviceKey,
      );

      if (
        byAuthor.length >=
          PrivateAuthorizationScope.MAX_ACCEPTED_OPERATIONS_PER_AUTHOR ||
        this.operationBytes(byAuthor) + value.byteSize >
          PrivateAuthorizationScope.MAX_ACCEPTED_BYTES_PER_AUTHOR
      ) {
        throw new PrivateAcceptedCapacityExceededError();
      }

      if (
        !checkpoint.toPrimitives().authorityKeys.includes(value.authorDeviceKey)
      ) {
        const authorityKeys = new Set(checkpoint.toPrimitives().authorityKeys);
        const nonAuthority = current.filter(
          (accepted) =>
            !authorityKeys.has(accepted.toPrimitives().authorDeviceKey),
        );

        if (
          nonAuthority.length >=
            PrivateAuthorizationScope.MAX_NON_AUTHORITY_ACCEPTED_OPERATIONS ||
          this.operationBytes(nonAuthority) + value.byteSize >
            PrivateAuthorizationScope.MAX_NON_AUTHORITY_ACCEPTED_BYTES
        ) {
          throw new PrivateAcceptedCapacityExceededError();
        }
      }
    }

    this.retainedAccepted(
      [...this.acceptedOperations, operation],
      pending,
      checkpoint,
    );
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

  private isPermanentlyInvalidPending(
    operation: PrivateControlOperation,
    authorizationCheckpoint: PrivateAuthorizationCheckpoint = this.checkpoint,
  ): boolean {
    const value = operation.toPrimitives();
    const checkpoint = authorizationCheckpoint.toPrimitives();

    return (
      value.authorizationRevision < checkpoint.revision ||
      !checkpoint.admittedDeviceKeys.includes(value.authorDeviceKey) ||
      checkpoint.revokedDeviceKeys.includes(value.authorDeviceKey) ||
      (value.kind === 'membership.propose' &&
        value.authorizationRevision === checkpoint.revision &&
        value.control?.parentHeadHash !== checkpoint.headHash)
    );
  }

  private prunePending(): void {
    for (
      let index = this.pendingOperations.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (this.isPermanentlyInvalidPending(this.pendingOperations[index])) {
        this.pendingOperations.splice(index, 1);
      }
    }
  }

  private enqueue(operation: PrivateControlOperation): void {
    const candidate = operation.toPrimitives();
    const duplicate = this.pendingOperations.find(
      (pending) => pending.toPrimitives().id === candidate.id,
    );

    if (duplicate) {
      if (duplicate.toPrimitives().digest !== candidate.digest) {
        this.freeze();
      }

      return;
    }

    const byAuthor = this.pendingOperations.filter(
      (pending) =>
        pending.toPrimitives().authorDeviceKey === candidate.authorDeviceKey,
    );
    const withinGlobalCapacity =
      this.pendingOperations.length <
        PrivateAuthorizationScope.MAX_PENDING_OPERATIONS &&
      this.operationBytes(this.pendingOperations) + candidate.byteSize <=
        PrivateAuthorizationScope.MAX_PENDING_BYTES;
    const withinAuthorCapacity =
      byAuthor.length <
        PrivateAuthorizationScope.MAX_PENDING_OPERATIONS_PER_AUTHOR &&
      this.operationBytes(byAuthor) + candidate.byteSize <=
        PrivateAuthorizationScope.MAX_PENDING_BYTES_PER_AUTHOR;

    assert(
      withinGlobalCapacity && withinAuthorCapacity,
      new PrivatePendingCapacityExceededError(),
    );

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
    const assessment = this.assess(operation, 'membership.propose');

    if (assessment !== 'ready') return assessment;
    this.assertAcceptedCapacity(operation);
    this.acceptNow(operation);
    this.compactAccepted();

    return 'accepted';
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
    this.assertAcceptedCapacity(operation, candidate);
    this.acceptNow(operation);
    this.checkpoint = candidate;
    this.prunePending();
    this.compactAccepted();

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
    this.assertAcceptedCapacity(operation, candidate);
    this.acceptNow(operation);
    this.checkpoint = candidate;
    this.prunePending();
    this.compactAccepted();

    return 'accepted';
  }

  public assess(
    operation: PrivateControlOperation,
    expectedKind: string = operation.toPrimitives().kind,
  ): 'duplicate' | 'pending' | 'ready' {
    const duplicate = this.duplicateResult(operation);

    if (duplicate === 'duplicate') return duplicate;
    this.assertActive();
    this.prunePending();
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
