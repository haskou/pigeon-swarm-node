import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';
import { AuthenticatedPrivateOperationJson } from '../../domain/value-objects/AuthenticatedPrivateOperationJson';
import { PrivateControlFrame } from './messages/PrivateControlFrame';
import { PrivateVerifiedControlTransition } from './PrivateVerifiedControlTransition';

export abstract class PrivateControlTransitionProcessor {
  public abstract verify(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    authenticatedOperation: AuthenticatedPrivateOperationJson,
    frame: PrivateControlFrame,
  ): Promise<PrivateVerifiedControlTransition>;
}
