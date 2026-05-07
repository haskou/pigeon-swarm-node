import { MessageEvent } from '@app/contexts/conversations/domain/MessageEvent';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { MongoMessageEventMetadataDocument } from '../documents/MongoMessageEventMetadataDocument';

export default class MongoMessageEventMetadataMapper {
  public toDocument(
    event: MessageEvent,
    cid: IPFSId,
    recipientIds: string[],
    networkId?: NetworkId,
    receivedAt: Timestamp = Timestamp.now(),
    valid = true,
  ): MongoMessageEventMetadataDocument {
    const primitives = event.toPrimitives();

    return {
      _id: primitives.id,
      authorId: primitives.authorId,
      cid: cid.valueOf(),
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      eventId: primitives.id,
      networkId: networkId?.valueOf(),
      receivedAt: receivedAt.valueOf(),
      recipientIds,
      targetEventId: primitives.targetEventId,
      type: primitives.type,
      valid,
    };
  }
}
