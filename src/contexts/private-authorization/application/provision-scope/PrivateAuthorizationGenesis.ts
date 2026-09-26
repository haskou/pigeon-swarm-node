import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';

export interface PrivateAuthorizationGenesis {
  checkpoint: PrivateAuthorizationCheckpoint;
  genesisHash: string;
}
