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
      networkId: this.body.networkId,
      operation: this.body.operation,
      participantIds: this.body.participantIds,
    });
  }
}
