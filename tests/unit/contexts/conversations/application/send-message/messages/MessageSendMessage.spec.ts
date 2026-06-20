import { MessageSendMessage } from '@app/contexts/conversations/application/send-message/messages/MessageSendMessage';
import { MessageSendPayload } from '@app/contexts/conversations/application/send-message/messages/MessageSendPayload';

import { IdentityMother } from '../../../../../mothers/IdentityMother';

const SIGNATURE =
  'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==';

describe('MessageSendMessage', () => {
  it('should convert primitive send input into conversation value objects', () => {
    const authorIdentityId = new IdentityMother().id.valueOf();
    const message = new MessageSendMessage(
      'conversation-1',
      authorIdentityId,
      new MessageSendPayload(
        'message-1',
        'encrypted-payload',
        SIGNATURE,
        1780000000000,
        ['attachment-1'],
        ['previous-message-1'],
        'reply-message-1',
      ),
    );
    const options = message.getOptions();

    expect(message.getConversationId().valueOf()).toBe('conversation-1');
    expect(message.getAuthorIdentityId().valueOf()).toBe(authorIdentityId);
    expect(message.getEncryptedPayload().valueOf()).toBe('encrypted-payload');
    expect(message.getSignature().valueOf()).toBe(SIGNATURE);
    expect(options.getId().valueOf()).toBe('message-1');
    expect(options.getCreatedAt().valueOf()).toBe(1780000000000);
    expect(options.getAttachments().map((attachment) => attachment.valueOf()))
      .toEqual(['attachment-1']);
    expect(options.getPreviousMessageIds().map((messageId) =>
      messageId.valueOf(),
    )).toEqual(['previous-message-1']);
    expect(options.getReplyToMessageId()?.valueOf()).toBe('reply-message-1');
  });
});
