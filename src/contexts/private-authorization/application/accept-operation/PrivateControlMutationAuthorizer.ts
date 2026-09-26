import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperationPrimitives } from '../../domain/PrivateControlOperationPrimitives';

export abstract class PrivateControlMutationAuthorizer {
  public abstract apply(
    checkpoint: PrivateAuthorizationCheckpoint,
    mutation: PrivateControlOperationPrimitives['mutation'],
    projection: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
