import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';

export abstract class PrivateControlMutationAuthorizer {
  public abstract apply(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    projection: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
