import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class OneToOneConversationCreateMessage {
  public readonly keychainExternalIdentifier: KeychainExternalIdentifier;

  public readonly ownerIdentityId: IdentityId;

  public readonly participantIdentityId: IdentityId;

  constructor(
    ownerIdentityId: string,
    participantIdentityId: string,
    keychainExternalIdentifier: string,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.participantIdentityId = new IdentityId(participantIdentityId);
    this.keychainExternalIdentifier = new KeychainExternalIdentifier(
      keychainExternalIdentifier,
    );
  }
}
