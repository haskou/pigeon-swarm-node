import { CreateOneToOneConversationMessage } from '@app/contexts/conversations/application/create-one-to-one/messages/CreateOneToOneConversationMessage';

import { PostOneToOneConversationBody } from '../bodies/PostOneToOneConversationBody';

export class PostOneToOneConversationRequest {
  constructor(private readonly body: PostOneToOneConversationBody) {}

  public getMessage(): CreateOneToOneConversationMessage {
    return new CreateOneToOneConversationMessage(
      this.body.firstParticipantIdentityId,
      this.body.secondParticipantIdentityId,
    );
  }
}
