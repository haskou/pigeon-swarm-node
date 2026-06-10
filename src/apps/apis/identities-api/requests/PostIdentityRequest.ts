import { IdentityCreateMessage } from '@app/contexts/identities/application/create/messages/IdentityCreateMessage';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';

import { PostIdentityBody } from '../bodies/PostIdentityBody';

export class PostIdentityRequest {
  constructor(private readonly body: PostIdentityBody) {}

  private getEncryptedKeyPair(): {
    encryptedPrivateKey: string;
    publicKey: string;
  } {
    return (
      this.body.encryptedKeyPair || {
        encryptedPrivateKey: '',
        publicKey: '',
      }
    );
  }

  private getMasterKeyDerivation(): Record<string, unknown> {
    return this.body.masterKeyDerivation || {};
  }

  private getProfile(): {
    banner: string | undefined;
    biography: string | undefined;
    handle: string | undefined;
    name: string;
    picture: string | undefined;
  } {
    return {
      banner: this.body.profile?.banner,
      biography: this.body.profile?.biography,
      handle: this.body.profile?.handle,
      name: this.body.profile?.name || '',
      picture: this.body.profile?.picture,
    };
  }

  private hasSignedIdentityFields(): boolean {
    return [
      this.body.id,
      this.body.encryptedKeyPair,
      this.body.encryptedMasterKey,
      this.body.masterKeyDerivation,
      this.body.profile,
      this.body.signature,
      this.body.timestamp,
      this.body.version,
    ].every(Boolean);
  }

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
      encryptedKeyPair: this.getEncryptedKeyPair(),
      encryptedMasterKey: this.body.encryptedMasterKey || '',
      id: this.body.id || '',
      masterKeyDerivation: this.getMasterKeyDerivation(),
      networks: this.body.networks || [],
      previousIdentityExternalIdentifier:
        this.body.previousIdentityExternalIdentifier,
      profile: this.getProfile(),
      signature: this.body.signature || '',
      timestamp: this.body.timestamp || 0,
      version: this.body.version || 0,
    });
  }

  public isClientSignedIdentity(): boolean {
    return this.hasSignedIdentityFields();
  }
}
