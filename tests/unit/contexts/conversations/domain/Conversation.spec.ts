import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { MessageTargetAlreadyDeletedError } from '@app/contexts/conversations/domain/errors/MessageTargetAlreadyDeletedError';
import { MessageTargetAuthorMismatchError } from '@app/contexts/conversations/domain/errors/MessageTargetAuthorMismatchError';
import { MessageTargetNotFoundError } from '@app/contexts/conversations/domain/errors/MessageTargetNotFoundError';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { AttachmentExternalIdentifier } from '@app/contexts/conversations/domain/value-objects/AttachmentExternalIdentifier';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

import { ConversationMother } from '../../../mothers/ConversationMother';

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
        signature(),
        [
          new AttachmentExternalIdentifier(
            'bafybeigdyrzt5sfp7udm7hu76t5dp5whztr3v3gvl6wv4x7q5v2fi6c5mm',
          ),
        ],
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
      expect(conversation.pullDomainEvents()).toEqual([
        expect.any(ConversationMessageWasSentEvent),
      ]);
    });

    it('should reject messages from non participants', () => {
      expect(() =>
        conversation.sendMessage(
          outsider,
          new EncryptedMessagePayload('encrypted-payload'),
          signature(),
        ),
      ).toThrow(ConversationParticipantNotFoundError);
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
        signature(),
      );
      conversation.pullDomainEvents();

      const edited = conversation.editMessage(
        author,
        sent.getId(),
        new EncryptedMessagePayload('edited-payload'),
        signature(),
      );

      expect(edited.getTargetMessageId().valueOf()).toBe(
        sent.getId().valueOf(),
      );
      expect(conversation.toPrimitives().messages).toHaveLength(2);
      expect(conversation.pullDomainEvents()).toEqual([
        expect.any(ConversationMessageWasEditedEvent),
      ]);
    });

    it('should reject edits by a different participant', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        signature(),
      );

      expect(() =>
        conversation.editMessage(
          recipient,
          sent.getId(),
          new EncryptedMessagePayload('edited-payload'),
          signature(),
        ),
      ).toThrow(MessageTargetAuthorMismatchError);
    });

    it('should reject edits for unknown targets', () => {
      expect(() =>
        conversation.editMessage(
          author,
          MessageId.generate(),
          new EncryptedMessagePayload('edited-payload'),
          signature(),
        ),
      ).toThrow(MessageTargetNotFoundError);
    });
  });

  describe('deleteMessage', () => {
    it('should add a deleted message', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        signature(),
      );
      conversation.pullDomainEvents();

      const deleted = conversation.deleteMessage(
        author,
        sent.getId(),
        signature(),
      );

      expect(deleted.getTargetMessageId().valueOf()).toBe(
        sent.getId().valueOf(),
      );
      expect(conversation.toPrimitives().messages).toHaveLength(2);
      expect(conversation.pullDomainEvents()).toEqual([
        expect.any(ConversationMessageWasDeletedEvent),
      ]);
    });

    it('should use the target message as the deleted message previous id', () => {
      const target = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('target-payload'),
        signature(),
      );
      conversation.sendMessage(
        author,
        new EncryptedMessagePayload('newer-payload'),
        signature(),
      );

      const deleted = conversation.deleteMessage(
        author,
        target.getId(),
        signature(),
      );

      expect(deleted.toPrimitives().previousMessageIds).toEqual([
        target.getId().valueOf(),
      ]);
    });

    it('should reject deleting the same message twice', () => {
      const sent = conversation.sendMessage(
        author,
        new EncryptedMessagePayload('original-payload'),
        signature(),
      );

      conversation.deleteMessage(author, sent.getId(), signature());

      expect(() =>
        conversation.deleteMessage(author, sent.getId(), signature()),
      ).toThrow(MessageTargetAlreadyDeletedError);
    });
  });
});

function signature(): Signature {
  return new Signature(
    'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
  );
}
