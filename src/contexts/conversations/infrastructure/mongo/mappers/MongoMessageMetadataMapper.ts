import { Message } from '@app/contexts/conversations/domain/Message';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { MongoMessageMetadataDocument } from '../documents/MongoMessageMetadataDocument';

export default class MongoMessageMetadataMapper {
  public toDocument(
    event: Message,
    cid: IPFSId,
    recipientIds: string[],
    networkId?: NetworkId,
    receivedAt: Timestamp = Timestamp.now(),
    valid = true,
  ): MongoMessageMetadataDocument {
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
