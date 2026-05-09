import { KeychainPublishMessage } from '@app/contexts/keychains/application/publish/messages/KeychainPublishMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostKeychainBody } from '../bodies/PostKeychainBody';

export class PostKeychainRequest {
  constructor(
    private readonly body: PostKeychainBody,
    private readonly ownerIdentityId: IdentityId,
  ) {}

  public getKeychainPublishMessage(): KeychainPublishMessage {
    return new KeychainPublishMessage(
      this.ownerIdentityId.valueOf(),
      this.body.encryptedPayload,
      this.body.timestamp,
      this.body.signature,
      this.body.version,
      this.body.previousKeychainExternalIdentifier ?? undefined,
    );
  }
}
