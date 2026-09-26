import { PrivateExpectedCheckpoint } from '@app/contexts/private-authorization/application/PrivateExpectedCheckpoint';
import { PrivateOperationAcceptance } from '@app/contexts/private-authorization/application/PrivateOperationAcceptance';
import { PrivateOperationUnitOfWork } from '@app/contexts/private-authorization/application/PrivateOperationUnitOfWork';
import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import LocalPrivateAuthorizationRepository from './LocalPrivateAuthorizationRepository';
import {
  privateAuthorizationLocalId,
  PrivateAuthorizationLocalNamespaces,
} from './PrivateAuthorizationLocalNamespaces';

export default class LocalPrivateOperationUnitOfWork extends PrivateOperationUnitOfWork {
  private static readonly scopeQueues = new Map<string, Promise<void>>();

  public constructor(
    private readonly database: EmbeddedLocalDatabase,
    private readonly repository: LocalPrivateAuthorizationRepository,
  ) {
    super();
  }

  private async exclusively<T>(
    scopeId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous =
      LocalPrivateOperationUnitOfWork.scopeQueues.get(scopeId) ??
      Promise.resolve();
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    LocalPrivateOperationUnitOfWork.scopeQueues.set(scopeId, tail);
    await previous;

    try {
      return await action();
    } finally {
      release!();

      if (LocalPrivateOperationUnitOfWork.scopeQueues.get(scopeId) === tail) {
        LocalPrivateOperationUnitOfWork.scopeQueues.delete(scopeId);
      }
    }
  }

  private isExpected(
    acceptance: PrivateOperationAcceptance,
    expected: PrivateExpectedCheckpoint,
  ): boolean {
    const checkpoint = acceptance.scope.toPrimitives().checkpoint;

    return (
      checkpoint.revision === expected.revision + 1 &&
      checkpoint.parentHeadHash === expected.headHash
    );
  }

  private acceptanceOperations(
    scopeId: string,
    acceptance: PrivateOperationAcceptance,
  ): EmbeddedLocalDatabaseOperation[] {
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
        document: {},
        id: privateAuthorizationLocalId(scopeId, acceptance.replayMarkerId),
        namespace: PrivateAuthorizationLocalNamespaces.replay,
        type: 'put',
      },
      {
        document: {
          eventName: acceptance.outbox.eventName,
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
        document: { childHeadHash: acceptance.reservation.childHeadHash },
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

    return operations;
  }

  private async commitExclusively(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): Promise<'committed' | 'stale'> {
    const receipt = acceptance.receipt.toPrimitives();

    if (await this.isCommitted(scopeId, receipt.id, receipt.digest)) {
      return 'committed';
    }

    const currentScope = await this.repository.findScope(scopeId);
    const currentCheckpoint = currentScope?.toPrimitives().checkpoint;

    if (
      !this.matchesExpected(currentCheckpoint, expectedCheckpoint, acceptance)
    ) {
      return 'stale';
    }

    const acceptedScopeId = acceptance.scope.toPrimitives().checkpoint.scopeId;

    if ([acceptedScopeId, receipt.scopeId].some((id) => id !== scopeId)) {
      throw new Error('Invalid private authorization');
    }

    if (!(await this.reservationMatches(scopeId, acceptance))) return 'stale';

    await this.database.commit(this.acceptanceOperations(scopeId, acceptance));

    return 'committed';
  }

  private async isCommitted(
    scopeId: string,
    operationId: string,
    digest: string,
  ): Promise<boolean> {
    const existing = await this.repository.findReceipt(scopeId, operationId);

    if (!existing) return false;

    if (existing.digest !== digest) {
      throw new Error('Private authorization conflict');
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

  private async reservationMatches(
    scopeId: string,
    acceptance: PrivateOperationAcceptance,
  ): Promise<boolean> {
    if (!acceptance.reservation) return true;
    const reservedChild = await this.repository.findReservation(
      scopeId,
      acceptance.reservation.parentHeadHash,
    );

    return (
      !reservedChild || reservedChild === acceptance.reservation.childHeadHash
    );
  }

  public async commitAcceptance(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): Promise<'committed' | 'stale'> {
    return this.exclusively(scopeId, () =>
      this.commitExclusively(scopeId, expectedCheckpoint, acceptance),
    );
  }

  public async reserveChild(
    scopeId: string,
    parentHeadHash: string,
    childHeadHash: string,
  ): Promise<'reserved' | 'same' | 'conflict'> {
    return this.exclusively(scopeId, async () => {
      const existing = await this.repository.findReservation(
        scopeId,
        parentHeadHash,
      );

      if (existing) return existing === childHeadHash ? 'same' : 'conflict';

      await this.repository.saveReservation(
        scopeId,
        parentHeadHash,
        childHeadHash,
      );

      return 'reserved';
    });
  }
}
