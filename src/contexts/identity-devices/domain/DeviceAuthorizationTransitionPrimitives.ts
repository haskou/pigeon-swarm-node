import { DeviceAuthorizationOperationValue } from './value-objects/DeviceAuthorizationOperation';

export interface DeviceAuthorizationTransitionPrimitives {
  authorizedAt?: number;
  authorCredential?: string;
  compromisedSince?: number;
  epoch: string;
  identityId: string;
  operation: DeviceAuthorizationOperationValue;
  operationId: string;
  pairingExpiration?: number;
  pairingId?: string;
  previousRevision: number;
  proofOfPossession?: string;
  revision: number;
  signature: string;
  targetCredential: string;
  targetCredentialCommitment: string;
}
