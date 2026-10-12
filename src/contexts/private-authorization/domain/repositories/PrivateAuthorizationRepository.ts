import { PrivateAuthorizationCheckpoint } from '../PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '../PrivateAuthorizationScope';
import { PrivateControlOperation } from '../PrivateControlOperation';
import { PrivateControlOperationPrimitives } from '../PrivateControlOperationPrimitives';
import { PrivateControlTransitionReservation } from '../PrivateControlTransitionReservation';
import { PrivateAuthorizationRevision } from '../value-objects/PrivateAuthorizationRevision';
import { PrivateAuthorizationScopeId } from '../value-objects/PrivateAuthorizationScopeId';

export abstract class PrivateAuthorizationRepository {
  public abstract findOutbox(
    scopeId: string,
  ): Promise<Array<Record<string, unknown>>>;

  public abstract findPending(
    scopeId: string,
  ): Promise<PrivateControlOperation[]>;

  public abstract hasProjection(scopeId: string): Promise<boolean>;

  public abstract hasProtectedMlsState(scopeId: string): Promise<boolean>;

  public abstract hasReceipt(
    scopeId: string,
    operationId: string,
  ): Promise<boolean>;

  public abstract hasReservation(
    scopeId: string,
    parentHeadHash: string,
  ): Promise<boolean>;

  public abstract hasReservationAtRevision(
    scopeId: PrivateAuthorizationScopeId,
    revision: PrivateAuthorizationRevision,
  ): Promise<boolean>;

  public abstract hasScope(scopeId: string): Promise<boolean>;

  public abstract requireProjection(
    scopeId: string,
  ): Promise<Record<string, unknown>>;

  public abstract requireProtectedMlsState(scopeId: string): Promise<string>;

  public abstract requireReceipt(
    scopeId: string,
    operationId: string,
  ): Promise<PrivateControlOperationPrimitives>;

  public abstract requireReservation(
    scopeId: string,
    parentHeadHash: string,
  ): Promise<PrivateControlTransitionReservation>;

  public abstract requireReservationAtRevision(
    scopeId: PrivateAuthorizationScopeId,
    revision: PrivateAuthorizationRevision,
  ): Promise<PrivateControlTransitionReservation>;

  public abstract requireScope(
    scopeId: string,
  ): Promise<PrivateAuthorizationScope>;

  public abstract findScopeIds(): Promise<string[]>;

  public abstract hasReplayMarker(
    scopeId: string,
    markerId: string,
  ): Promise<boolean>;

  public abstract savePending(
    scopeId: string,
    operation: PrivateControlOperation,
  ): Promise<void>;

  public abstract saveProjection(
    scopeId: string,
    projection: Record<string, unknown>,
  ): Promise<void>;

  public abstract saveReceipt(
    scopeId: string,
    operation: PrivateControlOperation,
  ): Promise<void>;

  public abstract saveReservation(
    scopeId: string,
    parentHeadHash: string,
    childHeadHash: string,
    operationId: string,
    authorDeviceKey: string,
    parentCheckpoint: PrivateAuthorizationCheckpoint,
  ): Promise<void>;

  public abstract saveScope(scope: PrivateAuthorizationScope): Promise<void>;
}
