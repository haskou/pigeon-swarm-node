import { SyncRequestId } from '@app/contexts/shared/domain/value-objects/SyncRequestId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';

export class ConversationSyncResponseMessage {
  public readonly conversationId: ConversationId;
  public readonly requestId: SyncRequestId | undefined;

  constructor(conversationId: string, requestId?: string) {
    this.conversationId = new ConversationId(conversationId);
    this.requestId = requestId ? new SyncRequestId(requestId) : undefined;
  }
}
