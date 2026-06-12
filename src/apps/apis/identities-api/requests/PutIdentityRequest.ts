import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';

import { PutIdentityBody } from '../bodies/PutIdentityBody';

export class PutIdentityRequest {
  constructor(private readonly body: PutIdentityBody) {}

  public getIdentityPublishMessage(): IdentityPublishMessage {
    return new IdentityPublishMessage({
      encryptedKeyPair: this.body.encryptedKeyPair,
      encryptedMasterKey: this.body.encryptedMasterKey,
      id: this.body.id,
      masterKeyDerivation: this.body.masterKeyDerivation,
      networks: this.body.networks,
      previousIdentityExternalIdentifier:
        this.body.previousIdentityExternalIdentifier,
      profile: {
        banner: this.body.profile.banner,
        biography: this.body.profile.biography,
        handle: this.body.profile.handle,
        name: this.body.profile.name,
        picture: this.body.profile.picture,
      },
      signature: this.body.signature,
      timestamp: this.body.timestamp,
      version: this.body.version,
    });
  }
}
