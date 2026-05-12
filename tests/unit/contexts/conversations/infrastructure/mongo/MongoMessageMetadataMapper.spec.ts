import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import MongoMessageMetadataMapper from '@app/contexts/conversations/infrastructure/mongo/mappers/MongoMessageMetadataMapper';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Signature, Timestamp } from '@haskou/value-objects';

describe('MongoMessageMetadataMapper', () => {
  let mapper: MongoMessageMetadataMapper;

  beforeEach(() => {
    mapper = new MongoMessageMetadataMapper();
  });

  it('should map a message to mongo metadata', () => {
    const message = buildSentMessage();
    const primitives = message.toPrimitives();
    const cid = new IPFSId('bafymessagecid');
    const recipientIds = ['recipient-id'];
    const networkId = NetworkId.generate();
    const receivedAt = new Timestamp(1773848829999);

    expect(
      mapper.toDocument(message, cid, recipientIds, networkId, receivedAt),
    ).toEqual({
      _id: primitives.id,
      authorId: primitives.authorId,
      cid: cid.valueOf(),
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      messageId: primitives.id,
      networkId: networkId.valueOf(),
      receivedAt: receivedAt.valueOf(),
      recipientIds,
      targetMessageId: primitives.targetMessageId,
      type: primitives.type,
      valid: true,
    });
  });
});

function buildSentMessage(): MessageSent {
  return MessageSent.create({
    authorId: new IdentityId(
      'MCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=',
    ),
    conversationId: new ConversationId('conversation-a:conversation-b'),
    encryptedPayload: new EncryptedMessagePayload('encrypted-payload'),
    signature: new Signature(
      'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
    ),
  });
}
