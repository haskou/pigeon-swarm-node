import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { SyncRequestId } from '@app/contexts/shared/domain/value-objects/SyncRequestId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';

export class ConversationSyncResponseMessage {
  public readonly conversationId: ConversationId;
  public readonly networkId: NetworkId;
  public readonly requestId: SyncRequestId | undefined;

  constructor(conversationId: string, networkId: string, requestId?: string) {
    this.conversationId = new ConversationId(conversationId);
    this.networkId = new NetworkId(networkId);
    this.requestId = requestId ? new SyncRequestId(requestId) : undefined;
  }
}
