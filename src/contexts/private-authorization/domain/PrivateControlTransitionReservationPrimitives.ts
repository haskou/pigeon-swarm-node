import { PrivateAuthorizationCheckpointPrimitives } from './PrivateAuthorizationCheckpointPrimitives';

export interface PrivateControlTransitionReservationPrimitives {
  authorDeviceKey: string;
  childHeadHash: string;
  operationId: string;
  parentCheckpoint: PrivateAuthorizationCheckpointPrimitives;
}
