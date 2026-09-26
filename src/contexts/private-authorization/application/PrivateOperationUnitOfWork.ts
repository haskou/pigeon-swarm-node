import { PrivateExpectedCheckpoint } from './PrivateExpectedCheckpoint';
import { PrivateOperationAcceptance } from './PrivateOperationAcceptance';

export abstract class PrivateOperationUnitOfWork {
  public abstract commitAcceptance(
    scopeId: string,
    expectedCheckpoint: PrivateExpectedCheckpoint,
    acceptance: PrivateOperationAcceptance,
  ): Promise<'committed' | 'stale'>;

  public abstract reserveChild(
    scopeId: string,
    parentHeadHash: string,
    childHeadHash: string,
  ): Promise<'reserved' | 'same' | 'conflict'>;
}
