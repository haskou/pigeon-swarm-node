import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';

export interface PrivateVerifiedControlTransition {
  checkpoint: PrivateAuthorizationCheckpoint;
  protectedMlsState: string;
}
