import { ApplyDeviceAuthorizationTransitionMessage } from '@app/contexts/identity-devices/application/apply-transition/messages/ApplyDeviceAuthorizationTransitionMessage';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';

import { PostDeviceAuthorizationTransitionBody } from '../bodies/PostDeviceAuthorizationTransitionBody';

export class PostDeviceAuthorizationTransitionRequest {
  public constructor(
    private readonly body: PostDeviceAuthorizationTransitionBody,
  ) {}

  public getMessage(): ApplyDeviceAuthorizationTransitionMessage {
    return new ApplyDeviceAuthorizationTransitionMessage(
      DeviceAuthorizationTransition.fromPrimitives({
        authorCredential: this.body.authorCredential,
        authorizedAt: this.body.authorizedAt,
        identityId: this.body.identityId,
        operation: this.body.operation,
        operationId: this.body.operationId,
        pairingExpiration: this.body.pairingExpiration,
        pairingId: this.body.pairingId,
        previousRevision: this.body.previousRevision,
        proofOfPossession: this.body.proofOfPossession,
        revision: this.body.revision,
        signature: this.body.signature,
        targetCredential: this.body.targetCredential,
        targetCredentialCommitment: this.body.targetCredentialCommitment,
      }),
    );
  }
}
