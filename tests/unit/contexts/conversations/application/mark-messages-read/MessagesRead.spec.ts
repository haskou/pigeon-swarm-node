import { MessagesReadMarkMessage } from '@app/contexts/conversations/application/mark-messages-read/messages/MessagesReadMarkMessage';
import MessagesReadMarker from '@app/contexts/conversations/application/mark-messages-read/MessagesReadMarker';
import MessagesReadRegistrar from '@app/contexts/conversations/application/mark-messages-read/MessagesReadRegistrar';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('Messages read', () => {
  let mother: ConversationMother;
  let conversationRepository: MockProxy<ConversationRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversationRepository = mock<ConversationRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    conversationRepository.markReadUntil.mockResolvedValue(true);
  });

  function readMessage(conversation: Conversation): MessagesReadMarkMessage {
    return new MessagesReadMarkMessage(
      conversation.getId().valueOf(),
      mother.recipient.valueOf(),
      MessageId.generate().valueOf(),
      {
        body: {},
        method: 'PUT',
        path: '/read-until',
        signature: 'signature',
        timestamp: 1780000000000,
      },
    );
  }

  describe('MessagesReadMarker', () => {
    let marker: MessagesReadMarker;

    beforeEach(() => {
      marker = new MessagesReadMarker(conversationRepository, eventPublisher);
    });

    it('should mark a group conversation read and announce it', async () => {
      const conversation = mother.buildGroup();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await marker.mark(readMessage(conversation));

      expect(conversationRepository.markReadUntil).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('should reject marking a one-to-one conversation read', async () => {
      const conversation = mother.build();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(
        marker.mark(readMessage(conversation)),
      ).rejects.toBeInstanceOf(OneToOneConversationMessagesNotReplicatedError);
      expect(conversationRepository.markReadUntil).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('MessagesReadRegistrar', () => {
    let registrar: MessagesReadRegistrar;

    beforeEach(() => {
      registrar = new MessagesReadRegistrar(conversationRepository);
    });

    it('should store a read marker announced for a group conversation', async () => {
      const conversation = mother.buildGroup();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(registrar.register(readMessage(conversation))).resolves.toBe(
        true,
      );
      expect(conversationRepository.markReadUntil).toHaveBeenCalledTimes(1);
    });

    it('should refuse a read marker announced for a one-to-one conversation', async () => {
      const conversation = mother.build();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(
        registrar.register(readMessage(conversation)),
      ).rejects.toBeInstanceOf(OneToOneConversationMessagesNotReplicatedError);
      expect(conversationRepository.markReadUntil).not.toHaveBeenCalled();
    });
  });
});
