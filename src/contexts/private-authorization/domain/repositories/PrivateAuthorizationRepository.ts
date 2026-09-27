import { PrivateAuthorizationCheckpoint } from '../PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '../PrivateAuthorizationScope';
import { PrivateControlOperation } from '../PrivateControlOperation';
import { PrivateControlOperationPrimitives } from '../PrivateControlOperationPrimitives';
import { PrivateControlTransitionReservation } from '../PrivateControlTransitionReservation';

export abstract class PrivateAuthorizationRepository {
  public abstract findOutbox(
    scopeId: string,
  ): Promise<Array<Record<string, unknown>>>;

  public abstract findPending(
    scopeId: string,
  ): Promise<PrivateControlOperation[]>;

  public abstract findProjection(
    scopeId: string,
  ): Promise<Record<string, unknown> | undefined>;

  public abstract findProtectedMlsState(
    scopeId: string,
  ): Promise<string | undefined>;

  public abstract findReceipt(
    scopeId: string,
    operationId: string,
  ): Promise<PrivateControlOperationPrimitives | undefined>;

  public abstract findReservation(
    scopeId: string,
    parentHeadHash: string,
  ): Promise<PrivateControlTransitionReservation | undefined>;

  public abstract findScope(
    scopeId: string,
  ): Promise<PrivateAuthorizationScope | undefined>;

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
