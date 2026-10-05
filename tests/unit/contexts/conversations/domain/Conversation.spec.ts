import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { MessageTargetAlreadyDeletedError } from '@app/contexts/conversations/domain/errors/MessageTargetAlreadyDeletedError';
import { MessageTargetAuthorMismatchError } from '@app/contexts/conversations/domain/errors/MessageTargetAuthorMismatchError';
import { MessageTargetNotFoundError } from '@app/contexts/conversations/domain/errors/MessageTargetNotFoundError';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageEditOptions } from '@app/contexts/conversations/domain/value-objects/MessageEditOptions';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageSendOptions } from '@app/contexts/conversations/domain/value-objects/MessageSendOptions';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationMother } from '../../../mothers/ConversationMother';
import { messageProof } from '../support/messageProof';

describe('Conversation', () => {
  let author: IdentityId;
  let recipient: IdentityId;
  let outsider: IdentityId;
  let mother: ConversationMother;
  let conversation: OneToOneConversation;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    author = mother.author;
    recipient = mother.recipient;
    outsider = await ConversationMother.generateIdentityId();
    conversation = mother.build();
  });

  describe('sendMessage', () => {
    it('should add a sent message and record a domain event', () => {
      conversation.pullDomainEvents();

      const message = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('encrypted-payload'),
        messageProof(),
        new MessageSendOptions(),
      );

      expect(message).toBeInstanceOf(MessageSent);
      expect(conversation.toPrimitives().messages).toHaveLength(1);
      expect(conversation.toPrimitives().messages[0]).toEqual(
        expect.objectContaining({
          authorId: author.valueOf(),
          encryptedPayload: 'encrypted-payload',
          type: MessageType.SENT.valueOf(),
        }),
      );
      const events = conversation.pullDomainEvents();

      expect(events).toEqual([expect.any(ConversationMessageWasSentEvent)]);
      expect(events[0].attributes).toEqual({
        authorId: author.valueOf(),
        conversationName: undefined,
        conversationType: 'one-to-one',
        message: message.toPrimitives(),
        messageId: message.getId().valueOf(),
        mutationProof: messageProof().toPrimitives(),
        networkId: mother.networkId.valueOf(),
        participantIds: [author.valueOf(), recipient.valueOf()],
      });
    });

    it('should reject messages from non participants', () => {
      expect(() =>
        conversation.sendMessage(
          outsider,
          new EncryptedMessagePayload('encrypted-payload'),
          messageProof(),
        ),
      ).toThrow(ConversationParticipantNotFoundError);
    });

    it('should add a sent reply message', () => {
      const target = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('target-payload'),
        messageProof(),
      );
      const newer = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('newer-payload'),
        messageProof(),
      );

      const reply = conversation.sendMessage(
        recipient,
        new EncryptedMessagePayload('reply-payload'),
        messageProof(),
        new MessageSendOptions(
          undefined,
          undefined,
          [newer.getId()],
          target.getId(),
        ),
      );

      expect(reply.getReplyToMessageId()?.valueOf()).toBe(
        target.getId().valueOf(),
      );
      expect(conversation.toPrimitives().messages[2]).toEqual(
        expect.objectContaining({
          encryptedPayload: 'reply-payload',
          previousMessageIds: [newer.getId().valueOf()],
          replyToMessageId: target.getId().valueOf(),
          type: MessageType.SENT.valueOf(),
        }),
      );
    });

    it('should reject replies to unknown messages', () => {
      expect(() =>
        conversation.sendMessage(
          author,
          new EncryptedMessagePayload('reply-payload'),
          messageProof(),
          new MessageSendOptions(
            undefined,
            undefined,
            [],
            MessageId.generate(),
          ),
        ),
      ).toThrow(MessageTargetNotFoundError);
    });

    it('should reject explicit previous ids that do not exist', () => {
      expect(() =>
        conversation.sendMessage(
          author,
          new EncryptedMessagePayload('message-payload'),
          messageProof(),
          new MessageSendOptions(undefined, undefined, [MessageId.generate()]),
        ),
      ).toThrow(MessageTargetNotFoundError);
    });

    it('should reject replies to deleted messages', () => {
      const target = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('target-payload'),
        messageProof(),
      );
      conversation.deleteMessage(author, target.getId(), messageProof());

      expect(() =>
        conversation.sendMessage(
          recipient,
          new EncryptedMessagePayload('reply-payload'),
          messageProof(),
          new MessageSendOptions(undefined, undefined, [], target.getId()),
        ),
      ).toThrow(MessageTargetAlreadyDeletedError);
    });
  });

  describe('create', () => {
    it('should record a created domain event', () => {
      expect(conversation.pullDomainEvents()).toEqual([
        expect.any(ConversationWasCreatedEvent),
      ]);
    });
  });

  describe('editMessage', () => {
    it('should add an edited message', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        messageProof(),
      );
      conversation.pullDomainEvents();

      const edited = conversation.editMessage(
        author,
        sent.getId(),
        new EncryptedMessagePayload('edited-payload'),
        messageProof(),
      );

      expect(edited.getTargetMessageId().valueOf()).toBe(
        sent.getId().valueOf(),
      );
      expect(conversation.toPrimitives().messages).toHaveLength(2);
      const events = conversation.pullDomainEvents();

      expect(events).toEqual([expect.any(ConversationMessageWasEditedEvent)]);
      expect(events[0].attributes).toEqual({
        message: edited.toPrimitives(),
        messageId: edited.getId().valueOf(),
        mutationProof: messageProof().toPrimitives(),
        networkId: mother.networkId.valueOf(),
        participantIds: [author.valueOf(), recipient.valueOf()],
        targetMessageId: sent.getId().valueOf(),
      });
    });

    it('should reject edits by a different participant', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        messageProof(),
      );

      expect(() =>
        conversation.editMessage(
          recipient,
          sent.getId(),
          new EncryptedMessagePayload('edited-payload'),
          messageProof(),
        ),
      ).toThrow(MessageTargetAuthorMismatchError);
    });

    it('should reject edits for unknown targets', () => {
      expect(() =>
        conversation.editMessage(
          author,
          MessageId.generate(),
          new EncryptedMessagePayload('edited-payload'),
          messageProof(),
        ),
      ).toThrow(MessageTargetNotFoundError);
    });

    it('should reject edits with unknown previous ids', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        messageProof(),
      );

      expect(() =>
        conversation.editMessage(
          author,
          sent.getId(),
          new EncryptedMessagePayload('edited-payload'),
          messageProof(),
          new MessageEditOptions(undefined, undefined, [MessageId.generate()]),
        ),
      ).toThrow(MessageTargetNotFoundError);
    });
  });

  describe('addPollMessage', () => {
    it('should add a poll message that can be used as a previous message', () => {
      const poll = conversation.addPollMessage(author, PollId.generate());

      const message = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('message-after-poll'),
        messageProof(),
        new MessageSendOptions(undefined, undefined, [poll.getId()]),
      );

      expect(conversation.toPrimitives().messages[0]).toEqual(
        expect.objectContaining({
          id: poll.getId().valueOf(),
          pollId: poll.getId().valueOf(),
          type: MessageType.POLL.valueOf(),
        }),
      );
      expect(message.getPreviousMessageIds()[0].isEqual(poll.getId())).toBe(
        true,
      );
    });
  });

  describe('deleteMessage', () => {
    it('should add a deleted message', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        messageProof(),
      );
      conversation.pullDomainEvents();

      const deleted = conversation.deleteMessage(
        author,
        sent.getId(),
        messageProof(),
      );

      expect(deleted.getTargetMessageId().valueOf()).toBe(
        sent.getId().valueOf(),
      );
      expect(conversation.toPrimitives().messages).toHaveLength(2);
      const events = conversation.pullDomainEvents();

      expect(events).toEqual([expect.any(ConversationMessageWasDeletedEvent)]);
      expect(events[0].attributes).toEqual({
        message: deleted.toPrimitives(),
        messageId: deleted.getId().valueOf(),
        mutationProof: messageProof().toPrimitives(),
        networkId: mother.networkId.valueOf(),
        participantIds: [author.valueOf(), recipient.valueOf()],
        targetMessageId: sent.getId().valueOf(),
      });
    });

    it('should use the target message as the deleted message previous id', () => {
      const target = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('target-payload'),
        messageProof(),
      );
      conversation.sendMessage(
        author,
        new EncryptedMessagePayload('newer-payload'),
        messageProof(),
      );

      const deleted = conversation.deleteMessage(
        author,
        target.getId(),
        messageProof(),
      );

      expect(deleted.toPrimitives().previousMessageIds).toEqual([
        target.getId().valueOf(),
      ]);
    });

    it('should reject deleting the same message twice', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        messageProof(),
      );

      conversation.deleteMessage(author, sent.getId(), messageProof());

      expect(() =>
        conversation.deleteMessage(author, sent.getId(), messageProof()),
      ).toThrow(MessageTargetAlreadyDeletedError);
    });
  });
});
