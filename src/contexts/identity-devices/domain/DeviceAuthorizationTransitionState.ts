import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';

import { DeviceAuthorizationEpoch } from './value-objects/DeviceAuthorizationEpoch';
import { DeviceAuthorizationOperation } from './value-objects/DeviceAuthorizationOperation';
import { DeviceAuthorizationOperationId } from './value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from './value-objects/PairingAuthorization';

export interface DeviceAuthorizationTransitionState {
  authorCredential?: DeviceCredential;
  compromisedSince?: DeviceAuthorizationRevision;
  epoch: DeviceAuthorizationEpoch;
  identityId: IdentityId;
  operation: DeviceAuthorizationOperation;
  operationId: DeviceAuthorizationOperationId;
  pairing?: PairingAuthorization;
  previousRevision: DeviceAuthorizationRevision;
  proofOfPossession?: Signature;
  signature?: Signature;
  targetCredential: DeviceCredential;
}
