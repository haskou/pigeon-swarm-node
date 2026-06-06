import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { OneToOneConversationCreatePayload } from './types/OneToOneConversationCreatePayload';

export { OneToOneConversationCreatePayload } from './types/OneToOneConversationCreatePayload';

export class OneToOneConversationCreateMessage {
  public readonly keychainExternalIdentifier: KeychainExternalIdentifier;

  public readonly networkId: NetworkId;

  public readonly ownerIdentityId: IdentityId;

  public readonly participantIdentityId: IdentityId;

  constructor(
    ownerIdentityId: string,
    payload: OneToOneConversationCreatePayload,
  ) {
    const participantId = payload.participantIds.find(
      (id) => id !== ownerIdentityId,
    );

    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.participantIdentityId = new IdentityId(
      participantId ?? payload.participantIds[0],
    );
    this.keychainExternalIdentifier = new KeychainExternalIdentifier(
      payload.keychainExternalIdentifier,
    );
    this.networkId = new NetworkId(payload.networkId);
  }
}
