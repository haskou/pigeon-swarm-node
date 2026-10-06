import { ConversationCreateMessage } from '@app/contexts/conversations/application/create-conversation/messages/ConversationCreateMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostConversationBody } from '../bodies/PostConversationBody';

export class PostConversationRequest {
  constructor(
    private readonly body: PostConversationBody,
    private readonly ownerIdentityId: IdentityId,
  ) {}

  public getMessage(): ConversationCreateMessage {
    return new ConversationCreateMessage(this.ownerIdentityId.valueOf(), {
      keychainExternalIdentifier: this.body.keychainExternalIdentifier,
      name: this.body.name,
      networkId: this.body.networkId,
      nonce: this.body.nonce,
      operation: this.body.operation,
      participantIds: this.body.participantIds,
      type: this.body.type,
    });
  }
}
