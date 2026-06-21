import { MessageMetadata } from '@app/contexts/conversations/domain/entities/messages/MessageMetadata';
import { MessageSignaturePayload } from '@app/contexts/conversations/domain/entities/messages/MessageSignaturePayload';
import MessageSignatureDomainService from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

const identityId =
  'MCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=';
const signature =
  'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==';

describe('MessageSignatureDomainService', () => {
  it('builds sent message canonical signing content', () => {
    const payload = new MessageSignaturePayload(
      new MessageMetadata(
        new MessageId('message-id'),
        new ConversationId('one-to-one:conversation-id'),
        new IdentityId(identityId),
        [],
        new Timestamp(1778536870557),
        new Signature(signature),
        new MessageId('reply-message-id'),
      ),
      MessageType.SENT,
      [],
      new EncryptedMessagePayload('encrypted-message-payload'),
    );
    const signingContent =
      new MessageSignatureDomainService().getCanonicalSigningContent(payload);

    expect(signingContent).toBe(
      `{"attachmentExternalIdentifiers":[],"authorId":"${identityId}","conversationId":"one-to-one:conversation-id","createdAt":1778536870557,"encryptedPayload":"encrypted-message-payload","id":"message-id","previousMessageIds":[],"replyToMessageId":"reply-message-id","type":"sent"}`,
    );
  });

  it('builds deleted message canonical signing content', () => {
    const payload = new MessageSignaturePayload(
      new MessageMetadata(
        new MessageId('deleted-message-id'),
        new ConversationId('one-to-one:conversation-id'),
        new IdentityId(identityId),
        [],
        new Timestamp(1778536870557),
        new Signature(signature),
      ),
      MessageType.DELETED,
      [],
      undefined,
      new MessageId('message-id'),
    );
    const signingContent =
      new MessageSignatureDomainService().getCanonicalSigningContent(payload);

    expect(signingContent).toBe(
      `{"attachmentExternalIdentifiers":[],"authorId":"${identityId}","conversationId":"one-to-one:conversation-id","createdAt":1778536870557,"id":"deleted-message-id","previousMessageIds":[],"targetMessageId":"message-id","type":"deleted"}`,
    );
  });
});
