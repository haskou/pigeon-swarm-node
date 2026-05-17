import { MessageSignatureDomainService } from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';

describe('MessageSignatureDomainService', () => {
  it('serializes sent message payloads with the public signing contract order', () => {
    const serializedPayload = new MessageSignatureDomainService().serializePayload({
      attachmentExternalIdentifiers: [],
      authorId: 'identity-id',
      conversationId: 'one-to-one:conversation-id',
      createdAt: 1778536870557,
      encryptedPayload: 'encrypted-message-payload',
      id: 'message-id',
      previousMessageIds: [],
      replyToMessageId: 'reply-message-id',
      targetMessageId: undefined,
      type: 'sent',
    });

    expect(serializedPayload).toBe(
      '{"attachmentExternalIdentifiers":[],"authorId":"identity-id","conversationId":"one-to-one:conversation-id","createdAt":1778536870557,"encryptedPayload":"encrypted-message-payload","id":"message-id","previousMessageIds":[],"replyToMessageId":"reply-message-id","type":"sent"}',
    );
  });

  it('serializes deleted message payloads with the public signing contract order', () => {
    const serializedPayload = new MessageSignatureDomainService().serializePayload({
      attachmentExternalIdentifiers: [],
      authorId: 'identity-id',
      conversationId: 'one-to-one:conversation-id',
      createdAt: 1778536870557,
      id: 'deleted-message-id',
      previousMessageIds: [],
      replyToMessageId: undefined,
      targetMessageId: 'message-id',
      type: 'deleted',
    });

    expect(serializedPayload).toBe(
      '{"attachmentExternalIdentifiers":[],"authorId":"identity-id","conversationId":"one-to-one:conversation-id","createdAt":1778536870557,"id":"deleted-message-id","previousMessageIds":[],"targetMessageId":"message-id","type":"deleted"}',
    );
  });
});
