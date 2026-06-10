import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';

export class ConversationMessagePinsFindMessage {
  public readonly conversationId: ConversationId;
  public readonly identityId: IdentityId;

  constructor(identityId: string, conversationId: string) {
    this.identityId = new IdentityId(identityId);
    this.conversationId = new ConversationId(conversationId);
  }
}
