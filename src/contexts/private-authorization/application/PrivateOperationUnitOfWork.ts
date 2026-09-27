import { PrivateAuthorizationCheckpoint } from '../domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '../domain/PrivateControlOperation';
import { PrivateAuthorizationGenesisCommit } from './PrivateAuthorizationGenesisCommit';
import { PrivateExpectedCheckpoint } from './PrivateExpectedCheckpoint';
import { PrivateOperationAcceptance } from './PrivateOperationAcceptance';

export abstract class PrivateOperationUnitOfWork {
  public abstract commitGenesis(
    genesis: PrivateAuthorizationGenesisCommit,
  ): Promise<'committed' | 'duplicate'>;

  public abstract commitPending(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    operation: PrivateControlOperation,
  ): Promise<'committed' | 'stale'>;

  public abstract commitAcceptance(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): Promise<'committed' | 'stale'>;

  public abstract reserveChild(
    scopeId: string,
    parentHeadHash: string,
    childHeadHash: string,
    operationId: string,
    authorDeviceKey: string,
    parentCheckpoint: PrivateAuthorizationCheckpoint,
  ): Promise<'reserved' | 'same' | 'conflict'>;

  public abstract quarantine(scopeId: string): Promise<void>;
}
