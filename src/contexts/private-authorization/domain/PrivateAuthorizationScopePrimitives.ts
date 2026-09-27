import { PrivateAuthorizationCheckpointPrimitives } from './PrivateAuthorizationCheckpointPrimitives';
import { PrivateControlOperationPrimitives } from './PrivateControlOperationPrimitives';

export interface PrivateAuthorizationScopePrimitives {
  acceptedOperations: PrivateControlOperationPrimitives[];
  checkpoint: PrivateAuthorizationCheckpointPrimitives;
  genesisHash: string;
  ownerDeviceKey: string;
  pendingOperations: PrivateControlOperationPrimitives[];
  status: 'active' | 'frozen';
}
