import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationCheckpointPrimitives } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpointPrimitives';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateAuthorizationScopePrimitives } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScopePrimitives';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateControlOperationPrimitives } from '@app/contexts/private-authorization/domain/PrivateControlOperationPrimitives';
import { PrivateControlTransitionReservation } from '@app/contexts/private-authorization/domain/PrivateControlTransitionReservation';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { PrivateAuthorizationRevision } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationRevision';
import { PrivateAuthorizationScopeId } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationScopeId';
import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { assert } from '@haskou/value-objects';

import PrivateAuthorizationStorageCoordinator from '../PrivateAuthorizationStorageCoordinator';
import {
  privateAuthorizationLocalId,
  PrivateAuthorizationLocalNamespaces,
} from './PrivateAuthorizationLocalNamespaces';

export default class LocalPrivateAuthorizationRepository extends PrivateAuthorizationRepository {
  public constructor(
    private readonly database: EmbeddedLocalDatabase,
    private readonly storageCoordinator: PrivateAuthorizationStorageCoordinator,
  ) {
    super();
  }

  private isOperation(
    value: Record<string, unknown>,
  ): value is Record<string, unknown> & PrivateControlOperationPrimitives {
    const checks = [
      typeof value.id === 'string',
      typeof value.digest === 'string',
      typeof value.scopeId === 'string',
      typeof value.authorDeviceKey === 'string',
      typeof value.authorizationRevision === 'number',
      typeof value.byteSize === 'number',
      typeof value.kind === 'string',
      Array.isArray(value.previousOperationIds),
      typeof value.mutation === 'object',
      value.mutation !== null,
    ];

    return !checks.includes(false);
  }

  private reservationFrom(
    document: Record<string, unknown> | undefined,
  ): PrivateControlTransitionReservation | undefined {
    if (
      typeof document?.authorDeviceKey !== 'string' ||
      typeof document.childHeadHash !== 'string' ||
      typeof document.operationId !== 'string' ||
      !document.parentCheckpoint ||
      typeof document.parentCheckpoint !== 'object'
    ) {
      return undefined;
    }

    return PrivateControlTransitionReservation.fromPrimitives({
      authorDeviceKey: document.authorDeviceKey,
      childHeadHash: document.childHeadHash,
      operationId: document.operationId,
      parentCheckpoint:
        document.parentCheckpoint as unknown as PrivateAuthorizationCheckpointPrimitives,
    });
  }

  private scopeOperation(
    scope: PrivateAuthorizationScope,
  ): EmbeddedLocalDatabaseOperation {
    const primitives = scope.toPrimitives();

    return {
      document: { ...primitives, pendingOperations: [] },
      id: primitives.checkpoint.scopeId,
      namespace: PrivateAuthorizationLocalNamespaces.scopes,
      type: 'put',
    };
  }

  private pendingOperations(
    scope: PrivateAuthorizationScope,
  ): EmbeddedLocalDatabaseOperation[] {
    const primitives = scope.toPrimitives();

    return primitives.pendingOperations.map((operation) => ({
      document: { ...operation },
      id: privateAuthorizationLocalId(
        primitives.checkpoint.scopeId,
        operation.id,
      ),
      namespace: PrivateAuthorizationLocalNamespaces.pending,
      type: 'put',
    }));
  }

  public async findOutbox(
    scopeId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const prefix = `${scopeId}:`;

    return this.database.find(
      PrivateAuthorizationLocalNamespaces.outbox,
      (document) =>
        typeof document._id === 'string' && document._id.startsWith(prefix),
    );
  }

  public async findPending(
    scopeId: string,
  ): Promise<PrivateControlOperation[]> {
    const prefix = `${scopeId}:`;
    const documents = await this.database.find(
      PrivateAuthorizationLocalNamespaces.pending,
      (document) =>
        typeof document._id === 'string' && document._id.startsWith(prefix),
    );

    return documents
      .filter((document) => this.isOperation(document))
      .map((document) => {
        const operation = { ...document };
        delete operation._id;

        return PrivateControlOperation.fromPrimitives(operation);
      })
      .sort((left, right) =>
        left.toPrimitives().id.localeCompare(right.toPrimitives().id),
      );
  }

  public async findProjection(
    scopeId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const document = await this.database.findOne(
      PrivateAuthorizationLocalNamespaces.projections,
      scopeId,
    );

    if (!document) return undefined;
    const projection = { ...document };
    delete projection._id;

    return projection;
  }

  public async findProtectedMlsState(
    scopeId: string,
  ): Promise<string | undefined> {
    const document = await this.database.findOne(
      PrivateAuthorizationLocalNamespaces.mls,
      scopeId,
    );

    return typeof document?.state === 'string' ? document.state : undefined;
  }

  public async findReceipt(
    scopeId: string,
    operationId: string,
  ): Promise<PrivateControlOperationPrimitives | undefined> {
    const document = await this.database.findOne(
      PrivateAuthorizationLocalNamespaces.receipts,
      privateAuthorizationLocalId(scopeId, operationId),
    );

    if (!document || !this.isOperation(document)) return undefined;
    const receipt = { ...document };
    delete receipt._id;

    return receipt as unknown as PrivateControlOperationPrimitives;
  }

  public async findReservation(
    scopeId: string,
    parentHeadHash: string,
  ): Promise<PrivateControlTransitionReservation | undefined> {
    const document = await this.database.findOne(
      PrivateAuthorizationLocalNamespaces.reservations,
      privateAuthorizationLocalId(scopeId, parentHeadHash),
    );

    const reservation = this.reservationFrom(document);

    if (!reservation) return undefined;
    reservation.assertParent(scopeId, parentHeadHash);

    return reservation;
  }

  public async findReservationAtRevision(
    scopeId: PrivateAuthorizationScopeId,
    revision: PrivateAuthorizationRevision,
  ): Promise<PrivateControlTransitionReservation | undefined> {
    const scope = scopeId.valueOf();
    const prefix = `${scope}:`;
    const documents = await this.database.find(
      PrivateAuthorizationLocalNamespaces.reservations,
      (document) => {
        const checkpoint = document.parentCheckpoint as
          Record<string, unknown> | undefined;

        return (
          typeof document._id === 'string' &&
          document._id.startsWith(prefix) &&
          checkpoint?.revision === revision.valueOf()
        );
      },
    );

    assert(documents.length <= 1, new InvalidPrivateAuthorizationError());
    const reservation = this.reservationFrom(documents[0]);

    if (!reservation) return undefined;
    const parent = reservation.getParentCheckpoint();

    assert(
      parent.getScopeId().isEqual(scopeId) &&
        parent.getRevision().isEqual(revision),
      new InvalidPrivateAuthorizationError(),
    );

    return reservation;
  }

  public async findScope(
    scopeId: string,
  ): Promise<PrivateAuthorizationScope | undefined> {
    const document = await this.database.findOne(
      PrivateAuthorizationLocalNamespaces.scopes,
      scopeId,
    );

    if (!document) return undefined;
    const pendingOperations = (await this.findPending(scopeId)).map((pending) =>
      pending.toPrimitives(),
    );

    try {
      return PrivateAuthorizationScope.fromPrimitives({
        ...(document as unknown as PrivateAuthorizationScopePrimitives),
        pendingOperations,
      });
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public async findScopeIds(): Promise<string[]> {
    const documents = await this.database.find(
      PrivateAuthorizationLocalNamespaces.scopes,
      () => true,
    );

    return documents
      .map((document) => document._id)
      .filter((scopeId): scopeId is string => typeof scopeId === 'string')
      .sort((left, right) => left.localeCompare(right));
  }

  public async hasReplayMarker(
    scopeId: string,
    markerId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.database.findOne(
        PrivateAuthorizationLocalNamespaces.replay,
        privateAuthorizationLocalId(scopeId, markerId),
      ),
    );
  }

  public async savePending(
    scopeId: string,
    operation: PrivateControlOperation,
  ): Promise<void> {
    const primitives = operation.toPrimitives();

    if (primitives.scopeId !== scopeId) {
      throw new Error('Invalid private authorization');
    }
    const existing = (await this.findPending(scopeId)).find(
      (pending) => pending.toPrimitives().id === primitives.id,
    );

    if (existing?.toPrimitives().digest !== undefined) {
      if (existing.toPrimitives().digest !== primitives.digest) {
        throw new Error('Private authorization conflict');
      }

      return;
    }

    await this.database.save(
      PrivateAuthorizationLocalNamespaces.pending,
      privateAuthorizationLocalId(scopeId, primitives.id),
      { ...primitives },
    );
  }

  public async saveProjection(
    scopeId: string,
    projection: Record<string, unknown>,
  ): Promise<void> {
    await this.database.save(
      PrivateAuthorizationLocalNamespaces.projections,
      scopeId,
      projection,
    );
  }

  public async saveReceipt(
    scopeId: string,
    operation: PrivateControlOperation,
  ): Promise<void> {
    const primitives = operation.toPrimitives();
    const existing = await this.findReceipt(scopeId, primitives.id);

    if (existing && existing.digest !== primitives.digest) {
      throw new Error('Private authorization conflict');
    }

    if (existing) return;

    await this.database.save(
      PrivateAuthorizationLocalNamespaces.receipts,
      privateAuthorizationLocalId(scopeId, primitives.id),
      { ...primitives },
    );
  }

  public async saveReservation(
    scopeId: string,
    parentHeadHash: string,
    childHeadHash: string,
    operationId: string,
    authorDeviceKey: string,
    parentCheckpoint: PrivateAuthorizationCheckpoint,
  ): Promise<void> {
    const existing = await this.findReservation(scopeId, parentHeadHash);
    const candidate = PrivateControlTransitionReservation.fromPrimitives({
      authorDeviceKey,
      childHeadHash,
      operationId,
      parentCheckpoint: parentCheckpoint.toPrimitives(),
    });
    candidate.assertParent(scopeId, parentHeadHash);

    if (existing && !existing.matches(candidate)) {
      throw new Error('Private authorization conflict');
    }

    if (existing) return;

    await this.database.save(
      PrivateAuthorizationLocalNamespaces.reservations,
      privateAuthorizationLocalId(scopeId, parentHeadHash),
      { ...candidate.toPrimitives() },
    );
  }

  public async saveScope(scope: PrivateAuthorizationScope): Promise<void> {
    const scopeId = scope.toPrimitives().checkpoint.scopeId;

    await this.storageCoordinator.exclusively(scopeId, async () => {
      const storedPendingIds = (await this.findPending(scopeId)).map(
        (pending) => pending.toPrimitives().id,
      );
      const pendingIds = new Set(
        scope.toPrimitives().pendingOperations.map((pending) => pending.id),
      );

      await this.database.commit([
        this.scopeOperation(scope),
        ...this.pendingOperations(scope),
        ...storedPendingIds
          .filter((id) => !pendingIds.has(id))
          .map((id) => ({
            id: privateAuthorizationLocalId(scopeId, id),
            namespace: PrivateAuthorizationLocalNamespaces.pending,
            type: 'del' as const,
          })),
      ]);
    });
  }
}
