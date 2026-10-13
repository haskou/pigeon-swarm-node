import { ApplyDeviceAuthorizationTransitionMessage } from '@app/contexts/identity-devices/application/apply-transition/messages/ApplyDeviceAuthorizationTransitionMessage';
import { HandOverDeviceSealedSecretsMessage } from '@app/contexts/identity-devices/application/hand-over/messages/HandOverDeviceSealedSecretsMessage';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceSealedSecretBundleError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceSealedSecretBundleError';

import { PostDeviceAuthorizationTransitionBody } from '../bodies/PostDeviceAuthorizationTransitionBody';

export class PostDeviceAuthorizationTransitionRequest {
  private readonly transition: DeviceAuthorizationTransition;

  public constructor(
    private readonly body: PostDeviceAuthorizationTransitionBody,
  ) {
    this.transition = DeviceAuthorizationTransition.fromPrimitives({
      authorCredential: this.body.authorCredential,
      authorizedAt: this.body.authorizedAt,
      compromisedCredentials: this.body.compromisedCredentials,
      compromisedSince: this.body.compromisedSince,
      epoch: this.body.epoch,
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
    });
  }

  public getMessage(): ApplyDeviceAuthorizationTransitionMessage {
    return new ApplyDeviceAuthorizationTransitionMessage(this.transition);
  }

  /** The sealed secrets the author hands over when it retires itself. */
  public getHandoverMessage(): HandOverDeviceSealedSecretsMessage | undefined {
    const { authorCredential, sealedSecrets } = this.body;

    if (sealedSecrets === undefined) {
      return undefined;
    }

    if (authorCredential === undefined) {
      throw new InvalidDeviceSealedSecretBundleError(
        'only a device retiring itself hands over sealed secrets',
      );
    }

    return new HandOverDeviceSealedSecretsMessage(this.transition, {
      authorizationRevision: this.body.revision,
      entries: sealedSecrets.entries,
      generation: sealedSecrets.generation,
      identityId: this.body.identityId,
      publisherCredential: authorCredential,
    });
  }
}
