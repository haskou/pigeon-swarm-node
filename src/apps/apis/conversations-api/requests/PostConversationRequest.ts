import { GroupConversationCreateMessage } from '@app/contexts/conversations/application/create-group/messages/GroupConversationCreateMessage';
import { OneToOneConversationCreateMessage } from '@app/contexts/conversations/application/create-one-to-one/messages/OneToOneConversationCreateMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostConversationBody } from '../bodies/PostConversationBody';

export class PostConversationRequest {
  constructor(
    private readonly body: PostConversationBody,
    private readonly ownerIdentityId: IdentityId,
  ) {}

  public getGroupMessage(): GroupConversationCreateMessage {
    return new GroupConversationCreateMessage(this.ownerIdentityId.valueOf(), {
      keychainExternalIdentifier: this.body.keychainExternalIdentifier,
      name: this.body.name ?? '',
      networkId: this.body.networkId,
      participantIds: this.body.participantIds,
    });
  }

  public getOneToOneMessage(): OneToOneConversationCreateMessage {
    return new OneToOneConversationCreateMessage(
      this.ownerIdentityId.valueOf(),
      this.body,
    );
  }
}
