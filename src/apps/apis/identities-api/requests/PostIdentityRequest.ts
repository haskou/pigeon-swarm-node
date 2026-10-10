import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';

import { PostIdentityBody } from '../bodies/PostIdentityBody';

export class PostIdentityRequest {
  constructor(private readonly body: PostIdentityBody) {}

  private getProfile(): {
    banner: string | undefined;
    biography: string | undefined;
    handle: string | undefined;
    name: string;
    picture: string | undefined;
  } {
    return {
      banner: this.body.profile.banner,
      biography: this.body.profile.biography,
      handle: this.body.profile.handle,
      name: this.body.profile.name,
      picture: this.body.profile.picture,
    };
  }

  public getIdentityPublishMessage(): IdentityPublishMessage {
    return new IdentityPublishMessage({
      admissionNonce: this.body.admissionNonce,
      authorizationRevision: this.body.authorizationRevision,
      deviceCredential: this.body.deviceCredential,
      deviceCredentialCommitment: this.body.deviceCredentialCommitment,
      id: this.body.id || '',
      networks: this.body.networks,
      previousIdentityExternalIdentifier:
        this.body.previousIdentityExternalIdentifier,
      profile: this.getProfile(),
      recoveryAuthority: this.body.recoveryAuthority,
      signature: this.body.signature,
      timestamp: this.body.timestamp,
      version: this.body.version,
    });
  }
}
