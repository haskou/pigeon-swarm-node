import { OneToOneConversationCreateMessage } from '@app/contexts/conversations/application/create-one-to-one/messages/OneToOneConversationCreateMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostConversationBody } from '../bodies/PostConversationBody';

export class PostConversationRequest {
  constructor(
    private readonly body: PostConversationBody,
    private readonly ownerIdentityId: IdentityId,
  ) {}

  public getMessage(): OneToOneConversationCreateMessage {
    const participantId = this.body.participantIds.find(
      (id) => id !== this.ownerIdentityId.valueOf(),
    );

    return new OneToOneConversationCreateMessage(
      this.ownerIdentityId.valueOf(),
      participantId ?? this.body.participantIds[0],
      this.body.keychainExternalIdentifier,
    );
  }
}
