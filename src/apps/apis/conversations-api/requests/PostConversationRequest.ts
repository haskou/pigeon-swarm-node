import { OneToOneConversationCreateMessage } from '@app/contexts/conversations/application/create-one-to-one/messages/OneToOneConversationCreateMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostConversationBody } from '../bodies/PostConversationBody';

export class PostConversationRequest {
  constructor(
    private readonly body: PostConversationBody,
    private readonly ownerIdentityId: IdentityId,
  ) {}

  public getMessage(): OneToOneConversationCreateMessage {
    return new OneToOneConversationCreateMessage(
      this.ownerIdentityId.valueOf(),
      this.body,
    );
  }
}
