import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';

import { PostIdentityBody } from '../bodies/PostIdentityBody';

export class PostIdentityRequest {
  constructor(private readonly body: PostIdentityBody) {}

  public getIdentityCreateMessage(): IdentityCreateMessage {
    return new IdentityCreateMessage(
      this.body.name || '',
      this.body.password || '',
      this.body.networks || [],
      this.body.handle,
    );
  }

  public getIdentityPublishMessage(): IdentityPublishMessage {
    return new IdentityPublishMessage({
      encryptedKeyPair: this.body.encryptedKeyPair || {
        encryptedPrivateKey: '',
        publicKey: '',
      },
      id: this.body.id || '',
      networks: this.body.networks || [],
      previousIdentityExternalIdentifier:
        this.body.previousIdentityExternalIdentifier,
      profile: {
        banner: this.body.profile?.banner,
        biography: this.body.profile?.biography,
        handle: this.body.profile?.handle,
        name: this.body.profile?.name || '',
        picture: this.body.profile?.picture,
      },
      signature: this.body.signature || '',
      timestamp: this.body.timestamp || 0,
      version: this.body.version || 0,
    });
  }

  public isClientSignedIdentity(): boolean {
    return Boolean(
      this.body.id &&
      this.body.encryptedKeyPair &&
      this.body.profile &&
      this.body.signature &&
      this.body.timestamp &&
      this.body.version,
    );
  }
}
