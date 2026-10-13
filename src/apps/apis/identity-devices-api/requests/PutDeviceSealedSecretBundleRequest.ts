import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { PublishDeviceSealedSecretBundleMessage } from '@app/contexts/identity-devices/application/publish/messages/PublishDeviceSealedSecretBundleMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PutDeviceSealedSecretBundleBody } from '../bodies/PutDeviceSealedSecretBundleBody';

export class PutDeviceSealedSecretBundleRequest {
  public constructor(
    private readonly identityId: IdentityId,
    private readonly publisherCredential: DeviceCredential,
    private readonly body: PutDeviceSealedSecretBundleBody,
  ) {}

  public getMessage(): PublishDeviceSealedSecretBundleMessage {
    return new PublishDeviceSealedSecretBundleMessage({
      authorizationRevision: this.body.authorizationRevision,
      entries: this.body.entries,
      generation: this.body.generation,
      identityId: this.identityId.valueOf(),
      publisherCredential: this.publisherCredential.toWire(),
    });
  }
}
