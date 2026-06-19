import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import IpfsMessageMapper from '@app/contexts/conversations/infrastructure/ipfs/mappers/IpfsMessageMapper';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

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
