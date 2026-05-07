import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import MongoMessageEventMetadataMapper from '@app/contexts/conversations/infrastructure/mongo/mappers/MongoMessageEventMetadataMapper';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Signature, Timestamp } from '@haskou/value-objects';

describe('MongoMessageEventMetadataMapper', () => {
  let mapper: MongoMessageEventMetadataMapper;

  beforeEach(() => {
    mapper = new MongoMessageEventMetadataMapper();
  });

  it('should map a message event to mongo metadata', () => {
    const event = buildSentEvent();
    const primitives = event.toPrimitives();
    const cid = new IPFSId('bafymessagecid');
    const recipientIds = ['recipient-id'];
    const networkId = NetworkId.generate();
    const receivedAt = new Timestamp(1773848829999);

    expect(
      mapper.toDocument(event, cid, recipientIds, networkId, receivedAt),
    ).toEqual({
      _id: primitives.id,
      authorId: primitives.authorId,
      cid: cid.valueOf(),
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      eventId: primitives.id,
      networkId: networkId.valueOf(),
      receivedAt: receivedAt.valueOf(),
      recipientIds,
      targetEventId: primitives.targetEventId,
      type: primitives.type,
      valid: true,
    });
  });
});

function buildSentEvent(): MessageSent {
  return MessageSent.create(
    new ConversationId('conversation-a:conversation-b'),
    new IdentityId(
      'MCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=',
    ),
    new EncryptedMessagePayload('encrypted-payload'),
    new Signature(
      'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
    ),
  );
}
