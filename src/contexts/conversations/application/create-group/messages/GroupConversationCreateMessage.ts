import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { GroupConversationName } from '../../../domain/value-objects/GroupConversationName';

export type GroupConversationCreatePayload = {
  keychainExternalIdentifier: string;
  name: string;
  networkId: string;
  participantIds: string[];
};

export class GroupConversationCreateMessage {
  public readonly keychainExternalIdentifier: KeychainExternalIdentifier;

  public readonly name: GroupConversationName;

  public readonly networkId: NetworkId;

  public readonly ownerIdentityId: IdentityId;

  public readonly participantIdentityIds: IdentityId[];

  constructor(
    ownerIdentityId: string,
    payload: GroupConversationCreatePayload,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.keychainExternalIdentifier = new KeychainExternalIdentifier(
      payload.keychainExternalIdentifier,
    );
    this.name = new GroupConversationName(payload.name);
    this.networkId = new NetworkId(payload.networkId);
    this.participantIdentityIds = [
      ownerIdentityId,
      ...payload.participantIds.filter((id) => id !== ownerIdentityId),
    ].map((participantId) => new IdentityId(participantId));
  }
}
