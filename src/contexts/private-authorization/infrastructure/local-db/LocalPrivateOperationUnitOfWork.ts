import { PrivateAuthorizationGenesisCommit } from '@app/contexts/private-authorization/application/PrivateAuthorizationGenesisCommit';
import { PrivateExpectedCheckpoint } from '@app/contexts/private-authorization/application/PrivateExpectedCheckpoint';
import { PrivateOperationAcceptance } from '@app/contexts/private-authorization/application/PrivateOperationAcceptance';
import { PrivateOperationUnitOfWork } from '@app/contexts/private-authorization/application/PrivateOperationUnitOfWork';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationConflictError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationConflictError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationProvisioningQuota } from '@app/contexts/private-authorization/domain/PrivateAuthorizationProvisioningQuota';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateAuthorizationStorageReservationPrimitives } from '@app/contexts/private-authorization/domain/PrivateAuthorizationStorageReservationPrimitives';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateControlTransitionReservation } from '@app/contexts/private-authorization/domain/PrivateControlTransitionReservation';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { assert, Integer } from '@haskou/value-objects';
import { Buffer } from 'buffer';

import PrivateAuthorizationStorageCoordinator from '../PrivateAuthorizationStorageCoordinator';
import LocalPrivateAuthorizationRepository from './LocalPrivateAuthorizationRepository';
import {
  privateAuthorizationLocalId,
  PrivateAuthorizationLocalNamespaces,
} from './PrivateAuthorizationLocalNamespaces';

export default class LocalPrivateOperationUnitOfWork extends PrivateOperationUnitOfWork {
  private static readonly scopeQueuesByDatabase = new WeakMap<
    EmbeddedLocalDatabase,
    Map<string, Promise<void>>
  >();

  private static readonly provisioningQueuesByDatabase = new WeakMap<
    EmbeddedLocalDatabase,
    Promise<void>
  >();

  public constructor(
    private readonly database: EmbeddedLocalDatabase,
    private readonly repository: LocalPrivateAuthorizationRepository,
    private readonly storageCoordinator: PrivateAuthorizationStorageCoordinator,
  ) {
    super();
  }

  private getScopeQueues(): Map<string, Promise<void>> {
    const current = LocalPrivateOperationUnitOfWork.scopeQueuesByDatabase.get(
      this.database,
    );

    if (current) return current;
    const created = new Map<string, Promise<void>>();
    LocalPrivateOperationUnitOfWork.scopeQueuesByDatabase.set(
      this.database,
      created,
    );

    return created;
  }

  private async exclusively<T>(
    scopeId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const queues = this.getScopeQueues();
    const previous = queues.get(scopeId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    queues.set(scopeId, tail);
    await previous;

    try {
      return await action();
    } finally {
      release();

      if (queues.get(scopeId) === tail) {
        queues.delete(scopeId);
      }
    }
  }

  private async exclusivelyProvisioning<T>(
    action: () => Promise<T>,
  ): Promise<T> {
    const previous =
      LocalPrivateOperationUnitOfWork.provisioningQueuesByDatabase.get(
        this.database,
      ) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    LocalPrivateOperationUnitOfWork.provisioningQueuesByDatabase.set(
      this.database,
      tail,
    );
    await previous;

    try {
      return await action();
    } finally {
      release();

      if (
        LocalPrivateOperationUnitOfWork.provisioningQueuesByDatabase.get(
          this.database,
        ) === tail
      ) {
        LocalPrivateOperationUnitOfWork.provisioningQueuesByDatabase.delete(
          this.database,
        );
      }
    }
  }

  private genesisOperations(
    genesis: PrivateAuthorizationGenesisCommit,
    reservation?: PrivateAuthorizationStorageReservationPrimitives,
  ): EmbeddedLocalDatabaseOperation[] {
    const scope = genesis.scope.toPrimitives();
    const scopeId = scope.checkpoint.scopeId;

    const operations: EmbeddedLocalDatabaseOperation[] = [
      {
        document: { ...scope, pendingOperations: [] },
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.scopes,
        type: 'put',
      },
      {
        document: genesis.projection,
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.projections,
        type: 'put',
      },
      {
        document: { state: genesis.protectedMlsState },
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.mls,
        type: 'put',
      },
    ];

    if (reservation) {
      operations.push({
        document: { ...reservation },
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.provisioning,
        type: 'put',
      });
    }

    return operations;
  }

  private storageNamespaces(): string[] {
    return Object.values(PrivateAuthorizationLocalNamespaces).filter(
      (namespace) =>
        namespace !== PrivateAuthorizationLocalNamespaces.provisioning,
    );
  }

  private belongsToScope(
    document: Record<string, unknown>,
    scopeId: string,
  ): boolean {
    return (
      document._id === scopeId ||
      (typeof document._id === 'string' &&
        document._id.startsWith(`${scopeId}:`))
    );
  }

  private documentStorageBytes(
    namespace: string,
    document: Record<string, unknown>,
  ): number {
    return Buffer.byteLength(JSON.stringify({ document, namespace }));
  }

  private async storedDocumentsByNamespace(
    scopeId: string,
    namespaces: string[],
  ): Promise<Map<string, Map<string, Record<string, unknown>>>> {
    const entries = await Promise.all(
      namespaces.map(async (namespace) => {
        const documents = await this.database.find(namespace, (document) =>
          this.belongsToScope(document, scopeId),
        );

        return [
          namespace,
          new Map(
            documents.map((document) => [String(document._id), document]),
          ),
        ] as const;
      }),
    );

    return new Map(entries);
  }

  private applyStorageOperations(
    documentsByNamespace: Map<string, Map<string, Record<string, unknown>>>,
    operations: EmbeddedLocalDatabaseOperation[],
  ): void {
    for (const operation of operations) {
      const documents = documentsByNamespace.get(operation.namespace);

      if (!documents) continue;

      if (operation.type === 'del') documents.delete(operation.id);
      else {
        documents.set(operation.id, {
          ...operation.document,
          _id: operation.id,
        });
      }
    }
  }

  private storageBytes(
    documentsByNamespace: Map<string, Map<string, Record<string, unknown>>>,
  ): number {
    let total = 0;

    for (const [namespace, documents] of documentsByNamespace) {
      for (const document of documents.values()) {
        total += this.documentStorageBytes(namespace, document);
      }
    }

    return total;
  }

  private async provisionedBytesAfter(
    scopeId: string,
    operations: EmbeddedLocalDatabaseOperation[],
  ): Promise<number> {
    const namespaces = this.storageNamespaces();
    const documentsByNamespace = await this.storedDocumentsByNamespace(
      scopeId,
      namespaces,
    );
    this.applyStorageOperations(documentsByNamespace, operations);

    return this.storageBytes(documentsByNamespace);
  }

  private async provisioningQuota(
    excludedScopeId?: string,
  ): Promise<PrivateAuthorizationProvisioningQuota> {
    const documents = await this.database.find(
      PrivateAuthorizationLocalNamespaces.provisioning,
    );
    const reservations: PrivateAuthorizationStorageReservationPrimitives[] = [];

    for (const document of documents) {
      if (document._id === excludedScopeId) continue;
      reservations.push({
        ownerIdentityId: String(document.ownerIdentityId),
        provisionedBytes: Number(document.provisionedBytes),
      });
    }

    return new PrivateAuthorizationProvisioningQuota(reservations);
  }

  private async storageReservationForOperations(
    scopeId: string,
    operations: EmbeddedLocalDatabaseOperation[],
    ownerIdentityId?: IdentityId,
  ): Promise<PrivateAuthorizationStorageReservationPrimitives> {
    const current = await this.database.findOne(
      PrivateAuthorizationLocalNamespaces.provisioning,
      scopeId,
    );

    assert(current || ownerIdentityId, new InvalidPrivateAuthorizationError());
    const quota = await this.provisioningQuota(scopeId);

    return quota.reserve(
      ownerIdentityId ?? new IdentityId(String(current?.ownerIdentityId)),
      new Integer(await this.provisionedBytesAfter(scopeId, operations)),
    );
  }

  private pendingStateOperations(
    scope: PrivateAuthorizationScope,
    storedPendingIds: string[],
  ): EmbeddedLocalDatabaseOperation[] {
    const primitives = scope.toPrimitives();
    const scopeId = primitives.checkpoint.scopeId;
    const pendingIds = new Set(
      primitives.pendingOperations.map((pending) => pending.id),
    );

    return [
      {
        document: { ...primitives, pendingOperations: [] },
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.scopes,
        type: 'put',
      },
      ...primitives.pendingOperations.map((pending) => ({
        document: { ...pending },
        id: privateAuthorizationLocalId(scopeId, pending.id),
        namespace: PrivateAuthorizationLocalNamespaces.pending,
        type: 'put' as const,
      })),
      ...storedPendingIds
        .filter((id) => !pendingIds.has(id))
        .map((id) => ({
          id: privateAuthorizationLocalId(scopeId, id),
          namespace: PrivateAuthorizationLocalNamespaces.pending,
          type: 'del' as const,
        })),
    ];
  }

  private async persistScopeState(
    scope: PrivateAuthorizationScope,
  ): Promise<void> {
    const scopeId = scope.toPrimitives().checkpoint.scopeId;
    const storedPendingIds = (await this.repository.findPending(scopeId)).map(
      (pending) => pending.toPrimitives().id,
    );
    const operations = this.pendingStateOperations(scope, storedPendingIds);
    const storageReservation = await this.storageReservationForOperations(
      scopeId,
      operations,
    );
    operations.push({
      document: { ...storageReservation },
      id: scopeId,
      namespace: PrivateAuthorizationLocalNamespaces.provisioning,
      type: 'put',
    });
    await this.database.commit(operations);
  }

  private equal(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private async commitGenesisExclusively(
    genesis: PrivateAuthorizationGenesisCommit,
  ): Promise<'committed' | 'duplicate'> {
    const candidate = genesis.scope.toPrimitives();
    const scopeId = candidate.checkpoint.scopeId;
    const current = await this.repository.findScope(scopeId);

    if (!current) {
      const operations = this.genesisOperations(genesis);
      const reservation = await this.storageReservationForOperations(
        scopeId,
        operations,
        genesis.ownerIdentityId,
      );
      await this.database.commit(this.genesisOperations(genesis, reservation));

      return 'committed';
    }

    assert(
      current.isOwnedBy(
        new PrivateAuthorizationDeviceKey(candidate.ownerDeviceKey),
      ),
      new InvalidPrivateAuthorizationError(),
    );

    try {
      if (current.toPrimitives().status === 'frozen') {
        throw new PrivateAuthorizationConflictError();
      }
      current.pinGenesis(
        PrivateAuthorizationCheckpoint.fromPrimitives(candidate.checkpoint),
        candidate.genesisHash,
      );
      const [projection, protectedMlsState] = await Promise.all([
        this.repository.findProjection(scopeId),
        this.repository.findProtectedMlsState(scopeId),
      ]);

      if (
        !this.equal(projection, genesis.projection) ||
        protectedMlsState !== genesis.protectedMlsState
      ) {
        current.quarantine();
        throw new PrivateAuthorizationConflictError();
      }

      return 'duplicate';
    } catch (error) {
      if (!(error instanceof PrivateAuthorizationConflictError)) throw error;

      await this.database.commit([
        this.genesisOperations({ ...genesis, scope: current })[0],
      ]);
      throw error;
    }
  }

  private isExpected(
    acceptance: PrivateOperationAcceptance,
    expected: PrivateExpectedCheckpoint,
  ): boolean {
    const checkpoint = acceptance.scope.toPrimitives().checkpoint;

    const operation = acceptance.receipt.toPrimitives();

    if (operation.kind === 'membership.propose') {
      return (
        checkpoint.revision === expected.revision &&
        checkpoint.headHash === expected.headHash
      );
    }

    return (
      checkpoint.revision === expected.revision + 1 &&
      checkpoint.parentHeadHash === expected.headHash
    );
  }

  private async retiredRecordOperations(
    scopeId: string,
    retiredOperationIds: string[],
    acceptance: PrivateOperationAcceptance,
  ): Promise<EmbeddedLocalDatabaseOperation[]> {
    if (retiredOperationIds.length === 0) return [];
    const retired = new Set(retiredOperationIds);
    const prefix = `${scopeId}:`;
    const linkedNamespaces = [
      PrivateAuthorizationLocalNamespaces.outbox,
      PrivateAuthorizationLocalNamespaces.replay,
      PrivateAuthorizationLocalNamespaces.reservations,
    ];
    const linkedDocuments = await Promise.all(
      linkedNamespaces.map(async (namespace) => ({
        documents: await this.database.find(
          namespace,
          (document) =>
            typeof document._id === 'string' &&
            document._id.startsWith(prefix) &&
            typeof document.operationId === 'string' &&
            retired.has(document.operationId),
        ),
        namespace,
      })),
    );
    const operations: EmbeddedLocalDatabaseOperation[] =
      retiredOperationIds.map((operationId) => ({
        id: privateAuthorizationLocalId(scopeId, operationId),
        namespace: PrivateAuthorizationLocalNamespaces.receipts,
        type: 'del',
      }));

    for (const { documents, namespace } of linkedDocuments) {
      operations.push(
        ...documents
          .map((document) => document._id)
          .filter((id): id is string => typeof id === 'string')
          .map((id) => ({ id, namespace, type: 'del' as const })),
      );
    }

    if (retired.has(acceptance.receipt.toPrimitives().id)) {
      operations.push(
        {
          id: privateAuthorizationLocalId(scopeId, acceptance.replayMarkerId),
          namespace: PrivateAuthorizationLocalNamespaces.replay,
          type: 'del',
        },
        {
          id: privateAuthorizationLocalId(scopeId, acceptance.outbox.id),
          namespace: PrivateAuthorizationLocalNamespaces.outbox,
          type: 'del',
        },
      );

      if (acceptance.reservation) {
        operations.push({
          id: privateAuthorizationLocalId(
            scopeId,
            acceptance.reservation.parentHeadHash,
          ),
          namespace: PrivateAuthorizationLocalNamespaces.reservations,
          type: 'del',
        });
      }
    }

    return operations;
  }

  private async acceptanceOperations(
    scopeId: string,
    acceptance: PrivateOperationAcceptance,
    retiredOperationIds: string[],
  ): Promise<EmbeddedLocalDatabaseOperation[]> {
    const scope = acceptance.scope.toPrimitives();
    const receipt = acceptance.receipt.toPrimitives();
    const operations: EmbeddedLocalDatabaseOperation[] = [
      {
        document: { ...scope, pendingOperations: [] },
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.scopes,
        type: 'put',
      },
      {
        document: { ...receipt },
        id: privateAuthorizationLocalId(scopeId, receipt.id),
        namespace: PrivateAuthorizationLocalNamespaces.receipts,
        type: 'put',
      },
      {
        document: acceptance.projection,
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.projections,
        type: 'put',
      },
      {
        document: { operationId: receipt.id },
        id: privateAuthorizationLocalId(scopeId, acceptance.replayMarkerId),
        namespace: PrivateAuthorizationLocalNamespaces.replay,
        type: 'put',
      },
      {
        document: {
          eventName: acceptance.outbox.eventName,
          operationId: receipt.id,
          payload: acceptance.outbox.payload,
        },
        id: privateAuthorizationLocalId(scopeId, acceptance.outbox.id),
        namespace: PrivateAuthorizationLocalNamespaces.outbox,
        type: 'put',
      },
    ];

    if (acceptance.protectedMlsState !== undefined) {
      operations.push({
        document: { state: acceptance.protectedMlsState },
        id: scopeId,
        namespace: PrivateAuthorizationLocalNamespaces.mls,
        type: 'put',
      });
    }

    if (acceptance.reservation) {
      operations.push({
        document: {
          childHeadHash: acceptance.reservation.childHeadHash,
          operationId: acceptance.reservation.operationId,
        },
        id: privateAuthorizationLocalId(
          scopeId,
          acceptance.reservation.parentHeadHash,
        ),
        namespace: PrivateAuthorizationLocalNamespaces.reservations,
        type: 'put',
      });
    }

    operations.push(
      ...scope.pendingOperations.map((pending) => ({
        document: { ...pending },
        id: privateAuthorizationLocalId(scopeId, pending.id),
        namespace: PrivateAuthorizationLocalNamespaces.pending,
        type: 'put' as const,
      })),
      ...acceptance.clearPendingOperationIds.map((operationId) => ({
        id: privateAuthorizationLocalId(scopeId, operationId),
        namespace: PrivateAuthorizationLocalNamespaces.pending,
        type: 'del' as const,
      })),
    );
    operations.push(
      ...(await this.retiredRecordOperations(
        scopeId,
        retiredOperationIds,
        acceptance,
      )),
    );

    return operations;
  }

  private async commitExclusively(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): Promise<'committed' | 'stale'> {
    const receipt = acceptance.receipt.toPrimitives();

    if (await this.isCommitted(scopeId, acceptance.receipt)) {
      return 'committed';
    }

    const currentScope = await this.repository.findScope(scopeId);
    const currentCheckpoint = currentScope?.toPrimitives().checkpoint;
    const acceptedScopeId = acceptance.scope.toPrimitives().checkpoint.scopeId;

    if ([acceptedScopeId, receipt.scopeId].some((id) => id !== scopeId)) {
      throw new Error('Invalid private authorization');
    }

    if (currentScope) {
      await this.assertReservationCompatible(scopeId, currentScope, acceptance);
    }

    if (
      !this.matchesExpected(currentCheckpoint, expectedCheckpoint, acceptance)
    ) {
      return 'stale';
    }

    if (!currentScope) return 'stale';
    const acceptedBefore = new Set(
      currentScope
        .toPrimitives()
        .acceptedOperations.map((operation) => operation.id),
    );
    const rebasedAcceptance = await this.rebasePersistingQuarantine(
      currentScope,
      acceptance,
    );
    const retained = new Set(
      rebasedAcceptance.scope
        .toPrimitives()
        .acceptedOperations.map((operation) => operation.id),
    );
    const retiredOperationIds = [
      ...new Set([...acceptedBefore, receipt.id]),
    ].filter((operationId) => !retained.has(operationId));
    const operations = await this.acceptanceOperations(
      scopeId,
      rebasedAcceptance,
      retiredOperationIds,
    );
    const storageReservation = await this.storageReservationForOperations(
      scopeId,
      operations,
    );
    operations.push({
      document: { ...storageReservation },
      id: scopeId,
      namespace: PrivateAuthorizationLocalNamespaces.provisioning,
      type: 'put',
    });

    await this.database.commit(operations);

    return 'committed';
  }

  private async rebasePersistingQuarantine(
    currentScope: NonNullable<
      Awaited<ReturnType<LocalPrivateAuthorizationRepository['findScope']>>
    >,
    acceptance: PrivateOperationAcceptance,
  ): Promise<PrivateOperationAcceptance> {
    try {
      return this.rebaseAcceptance(currentScope, acceptance);
    } catch (error) {
      if (error instanceof PrivateAuthorizationConflictError) {
        await this.persistScopeState(currentScope);
      }

      throw error;
    }
  }

  private rebaseAcceptance(
    currentScope: NonNullable<
      Awaited<ReturnType<LocalPrivateAuthorizationRepository['findScope']>>
    >,
    acceptance: PrivateOperationAcceptance,
  ): PrivateOperationAcceptance {
    const pendingBefore = new Set(
      currentScope
        .toPrimitives()
        .pendingOperations.map((pending) => pending.id),
    );
    const operation = acceptance.receipt.toPrimitives();
    const candidate = PrivateAuthorizationCheckpoint.fromPrimitives(
      acceptance.scope.toPrimitives().checkpoint,
    );
    const result =
      operation.kind === 'membership.propose'
        ? currentScope.acceptProposal(acceptance.receipt)
        : operation.kind === 'membership.commit'
          ? currentScope.commitTransition(acceptance.receipt, candidate)
          : currentScope.revokeDevice(acceptance.receipt, candidate);

    if (result !== 'accepted' && result !== 'duplicate') {
      throw new Error('Invalid private authorization');
    }

    const pendingAfter = new Set(
      currentScope
        .toPrimitives()
        .pendingOperations.map((pending) => pending.id),
    );
    const removedPendingIds = [...pendingBefore].filter(
      (id) => !pendingAfter.has(id),
    );

    return {
      ...acceptance,
      clearPendingOperationIds: [
        ...new Set([
          ...acceptance.clearPendingOperationIds,
          ...removedPendingIds,
        ]),
      ],
      scope: currentScope,
    };
  }

  private async assertReservationCompatible(
    scopeId: string,
    scope: NonNullable<
      Awaited<ReturnType<LocalPrivateAuthorizationRepository['findScope']>>
    >,
    acceptance: PrivateOperationAcceptance,
  ): Promise<void> {
    if (!acceptance.reservation) return;
    const reservedChild = await this.repository.findReservation(
      scopeId,
      acceptance.reservation.parentHeadHash,
    );
    const candidate = PrivateControlTransitionReservation.fromPrimitives({
      childHeadHash: acceptance.reservation.childHeadHash,
      operationId: acceptance.reservation.operationId,
    });

    if (!reservedChild || reservedChild.matches(candidate)) {
      return;
    }

    scope.quarantine();
    await this.persistScopeState(scope);
    throw new PrivateAuthorizationConflictError();
  }

  private async isCommitted(
    scopeId: string,
    operation: PrivateControlOperation,
  ): Promise<boolean> {
    const candidate = operation.toPrimitives();
    const existing = await this.repository.findReceipt(scopeId, candidate.id);

    if (!existing) return false;

    if (existing.digest !== candidate.digest) {
      const receipt = PrivateControlOperation.fromPrimitives(existing);
      assert(
        receipt.isAuthoredBy(operation.getAuthorDeviceKey()),
        new InvalidPrivateAuthorizationError(),
      );
      const scope = await this.repository.findScope(scopeId);

      if (scope) {
        scope.quarantine();
        await this.persistScopeState(scope);
      }

      throw new PrivateAuthorizationConflictError();
    }

    return true;
  }

  private matchesExpected(
    current: { headHash: string; revision: number } | undefined,
    expected: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): boolean {
    if (!current) return false;

    return (
      current.headHash === expected.headHash &&
      current.revision === expected.revision &&
      this.isExpected(acceptance, expected)
    );
  }

  private checkpointMatches(
    scope: NonNullable<
      Awaited<ReturnType<LocalPrivateAuthorizationRepository['findScope']>>
    >,
    expected: PrivateExpectedCheckpoint,
  ): boolean {
    const checkpoint = scope.toPrimitives().checkpoint;

    return (
      checkpoint.headHash === expected.headHash &&
      checkpoint.revision === expected.revision
    );
  }

  private async commitPendingExclusively(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    operation: PrivateControlOperation,
  ): Promise<'committed' | 'stale'> {
    const scope = await this.repository.findScope(scopeId);

    if (!scope || !this.checkpointMatches(scope, expectedCheckpoint)) {
      return 'stale';
    }
    let assessment: ReturnType<typeof scope.assess>;

    try {
      assessment = scope.assess(operation);
    } catch (error) {
      if (error instanceof PrivateAuthorizationConflictError) {
        await this.persistScopeState(scope);
      }

      throw error;
    }

    if (assessment === 'ready') return 'stale';
    const [projection, protectedMlsState] = await Promise.all([
      this.repository.findProjection(scopeId),
      this.repository.findProtectedMlsState(scopeId),
    ]);

    assert(projection, new InvalidPrivateAuthorizationError());
    assert(
      typeof protectedMlsState === 'string',
      new InvalidPrivateAuthorizationError(),
    );
    await this.persistScopeState(scope);

    return 'committed';
  }

  private async commitGenesisWithStorageLock(
    scopeId: string,
    genesis: PrivateAuthorizationGenesisCommit,
  ): Promise<'committed' | 'duplicate'> {
    return this.storageCoordinator.exclusively(scopeId, () =>
      this.commitGenesisExclusively(genesis),
    );
  }

  public async commitAcceptance(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): Promise<'committed' | 'stale'> {
    return this.exclusivelyProvisioning(() =>
      this.exclusively(scopeId, () =>
        this.commitExclusively(scopeId, expectedCheckpoint, acceptance),
      ),
    );
  }

  public async commitGenesis(
    genesis: PrivateAuthorizationGenesisCommit,
  ): Promise<'committed' | 'duplicate'> {
    const scopeId = genesis.scope.toPrimitives().checkpoint.scopeId;

    return this.exclusivelyProvisioning(() =>
      this.exclusively(scopeId, () =>
        this.commitGenesisWithStorageLock(scopeId, genesis),
      ),
    );
  }

  public async commitPending(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    operation: PrivateControlOperation,
  ): Promise<'committed' | 'stale'> {
    return this.exclusivelyProvisioning(() =>
      this.exclusively(scopeId, () =>
        this.commitPendingExclusively(scopeId, expectedCheckpoint, operation),
      ),
    );
  }

  public async quarantine(scopeId: string): Promise<void> {
    return this.exclusivelyProvisioning(() =>
      this.exclusively(scopeId, async () => {
        const scope = await this.repository.findScope(scopeId);

        if (!scope) throw new PrivateAuthorizationConflictError();
        scope.quarantine();
        await this.persistScopeState(scope);
      }),
    );
  }

  public async reserveChild(
    scopeId: string,
    parentHeadHash: string,
    childHeadHash: string,
    operationId: string,
  ): Promise<'reserved' | 'same' | 'conflict'> {
    return this.exclusivelyProvisioning(() =>
      this.exclusively(scopeId, async () => {
        const existing = await this.repository.findReservation(
          scopeId,
          parentHeadHash,
        );
        const candidate = PrivateControlTransitionReservation.fromPrimitives({
          childHeadHash,
          operationId,
        });

        if (existing) {
          if (existing.matches(candidate)) return 'same';
          const scope = await this.repository.findScope(scopeId);

          if (scope) {
            scope.quarantine();
            await this.persistScopeState(scope);
          }

          return 'conflict';
        }
        const operations: EmbeddedLocalDatabaseOperation[] = [
          {
            document: { ...candidate.toPrimitives() },
            id: privateAuthorizationLocalId(scopeId, parentHeadHash),
            namespace: PrivateAuthorizationLocalNamespaces.reservations,
            type: 'put',
          },
        ];
        const storageReservation = await this.storageReservationForOperations(
          scopeId,
          operations,
        );
        operations.push({
          document: { ...storageReservation },
          id: scopeId,
          namespace: PrivateAuthorizationLocalNamespaces.provisioning,
          type: 'put',
        });
        await this.database.commit(operations);

        return 'reserved';
      }),
    );
  }
}
