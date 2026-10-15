import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationDraftKey } from '../../../domain/value-objects/ConversationDraftKey';

export class ConversationDraftDeleteMessage {
  public readonly draftKey: ConversationDraftKey;
  public readonly identityId: IdentityId;

  constructor(identityId: string, draftKey: string) {
    this.identityId = new IdentityId(identityId);
    this.draftKey = new ConversationDraftKey(draftKey);
  }
}
