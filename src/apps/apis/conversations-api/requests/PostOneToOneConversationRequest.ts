import { OneToOneConversationCreateMessage } from '@app/contexts/conversations/application/create-one-to-one/messages/OneToOneConversationCreateMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostOneToOneConversationBody } from '../bodies/PostOneToOneConversationBody';

export class PostOneToOneConversationRequest {
  constructor(
    private readonly body: PostOneToOneConversationBody,
    private readonly ownerIdentityId: IdentityId,
  ) {}

  public getMessage(): OneToOneConversationCreateMessage {
    return new OneToOneConversationCreateMessage(
      this.ownerIdentityId.valueOf(),
      this.body.participantIdentityId,
      this.body.keychainExternalIdentifier,
    );
  }
}
