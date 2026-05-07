import { Message } from '@app/contexts/conversations/domain/Message';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { MongoMessageMetadataDocument } from '../documents/MongoMessageMetadataDocument';

export default class MongoMessageMetadataMapper {
  public toDocument(
    message: Message,
    cid: IPFSId,
    recipientIds: string[],
    networkId?: NetworkId,
    receivedAt: Timestamp = Timestamp.now(),
    valid = true,
  ): MongoMessageMetadataDocument {
    const primitives = message.toPrimitives();

    return {
      _id: primitives.id,
      authorId: primitives.authorId,
      cid: cid.valueOf(),
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      messageId: primitives.id,
      networkId: networkId?.valueOf(),
      receivedAt: receivedAt.valueOf(),
      recipientIds,
      targetMessageId: primitives.targetMessageId,
      type: primitives.type,
      valid,
    };
  }
}
