import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';

export abstract class PrivateFreshnessGate {
  public abstract verify(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    signedProofJson: string,
  ): Promise<{ replayMarkerId: string }>;
}
