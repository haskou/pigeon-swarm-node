import { MessageMetadata } from '@app/contexts/conversations/domain/entities/messages/MessageMetadata';
import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import IpfsMessageMapper from '@app/contexts/conversations/infrastructure/ipfs/mappers/IpfsMessageMapper';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

describe('IpfsMessageMapper', () => {
  let mapper: IpfsMessageMapper;

  beforeEach(() => {
    mapper = new IpfsMessageMapper();
  });

  it('should map a message to an IPFS document', () => {
    const message = buildSentMessage();
    const primitives = message.toPrimitives();

    expect(mapper.toDocument(message)).toEqual({
      ...primitives,
      schemaVersion: 1,
    });
  });

  it('should map an IPFS document back to a message', () => {
    const message = buildSentMessage();
    const document = mapper.toDocument(message);

    expect(mapper.toDomain(document).toPrimitives()).toEqual(
      message.toPrimitives(),
    );
  });
});

function buildSentMessage(): MessageSent {
  const authorId = new IdentityId(
    'MCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=',
  );
  const conversationId = new ConversationId('conversation-a:conversation-b');
  const signature = new Signature(
    'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
  );

  return MessageSent.create(
    new MessageMetadata(
      MessageId.generate(),
      conversationId,
      authorId,
      [],
      Timestamp.now(),
      signature,
    ),
    new EncryptedMessagePayload('encrypted-payload'),
  );
}
