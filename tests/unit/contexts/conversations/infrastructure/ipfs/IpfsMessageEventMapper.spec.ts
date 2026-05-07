import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import IpfsMessageEventMapper from '@app/contexts/conversations/infrastructure/ipfs/mappers/IpfsMessageEventMapper';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

describe('IpfsMessageEventMapper', () => {
  let mapper: IpfsMessageEventMapper;

  beforeEach(() => {
    mapper = new IpfsMessageEventMapper();
  });

  it('should map a message event to an IPFS document', () => {
    const event = buildSentEvent();
    const primitives = event.toPrimitives();

    expect(mapper.toDocument(event)).toEqual({
      ...primitives,
      schemaVersion: 1,
    });
  });

  it('should map an IPFS document back to a message event', () => {
    const event = buildSentEvent();
    const document = mapper.toDocument(event);

    expect(mapper.toDomain(document).toPrimitives()).toEqual(
      event.toPrimitives(),
    );
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
