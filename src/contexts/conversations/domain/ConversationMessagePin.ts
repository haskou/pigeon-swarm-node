import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { MessageId } from './value-objects/MessageId';

export class ConversationMessagePin {
  constructor(
    private readonly messageId: MessageId,
    private readonly pinnedByIdentityId: IdentityId,
    private readonly createdAt: Timestamp,
  ) {}

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public getMessageId(): MessageId {
    return this.messageId;
  }

  public getPinnedByIdentityId(): IdentityId {
    return this.pinnedByIdentityId;
  }
}
