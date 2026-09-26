import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';
import { PrivateControlFrame } from './messages/PrivateControlFrame';
import { PrivateVerifiedControlTransition } from './PrivateVerifiedControlTransition';

export abstract class PrivateControlTransitionProcessor {
  public abstract verify(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    frame: PrivateControlFrame,
    currentProtectedMlsState: string,
  ): Promise<PrivateVerifiedControlTransition>;
}
