import ConversationMessagePinAccess from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinAccess';
import ConversationMessagePinner from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinner';
import ConversationMessagePinsFinder from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinsFinder';
import ConversationMessageUnpinner from '@app/contexts/conversations/application/manage-pin/ConversationMessageUnpinner';
import { ConversationMessagePinCreateMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinCreateMessage';
import { ConversationMessagePinDeleteMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinDeleteMessage';
import { ConversationMessagePinsFindMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinsFindMessage';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import ConversationMessagePinRepository from '@app/contexts/conversations/domain/repositories/ConversationMessagePinRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';
import { messageProof } from '../../support/messageProof';

describe('Conversation message pins', () => {
  let mother: ConversationMother;
  let conversationRepository: MockProxy<ConversationRepository>;
  let pinRepository: MockProxy<ConversationMessagePinRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let access: ConversationMessagePinAccess;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversationRepository = mock<ConversationRepository>();
    pinRepository = mock<ConversationMessagePinRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    access = new ConversationMessagePinAccess(conversationRepository);
    conversationRepository.hasMessage.mockResolvedValue(true);
    pinRepository.findByConversation.mockResolvedValue([]);
  });

  function pin(conversation: Conversation): Promise<void> {
    return new ConversationMessagePinner(
      conversationRepository,
      pinRepository,
      access,
      eventPublisher,
    ).pin(
      new ConversationMessagePinCreateMessage(
        mother.author.valueOf(),
        conversation.getId().valueOf(),
        MessageId.generate().valueOf(),
        1780000000000,
        messageProof().toPrimitives(),
      ),
    );
  }

  function unpin(conversation: Conversation): Promise<void> {
    return new ConversationMessageUnpinner(
      pinRepository,
      access,
      eventPublisher,
    ).unpin(
      new ConversationMessagePinDeleteMessage(
        mother.author.valueOf(),
        conversation.getId().valueOf(),
        MessageId.generate().valueOf(),
        messageProof().toPrimitives(),
      ),
    );
  }

  async function findPins(conversation: Conversation): Promise<void> {
    await new ConversationMessagePinsFinder(
      conversationRepository,
      pinRepository,
      access,
    ).find(
      new ConversationMessagePinsFindMessage(
        mother.author.valueOf(),
        conversation.getId().valueOf(),
      ),
    );
  }

  it('should pin, unpin and list pins of a group conversation', async () => {
    const conversation = mother.buildGroup();

    conversationRepository.requireMetadataById.mockResolvedValue(conversation);

    await pin(conversation);
    await unpin(conversation);
    await findPins(conversation);

    expect(pinRepository.pin).toHaveBeenCalledTimes(1);
    expect(pinRepository.unpin).toHaveBeenCalledTimes(1);
    expect(pinRepository.findByConversation).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
  });

  it.each<[string, (conversation: Conversation) => Promise<void>]>([
    ['pinning', (conversation) => pin(conversation)],
    ['unpinning', (conversation) => unpin(conversation)],
    ['listing pins', (conversation) => findPins(conversation)],
  ])(
    'should reject %s in a one-to-one conversation',
    async (_operation, operation) => {
      const conversation = mother.build();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(operation(conversation)).rejects.toBeInstanceOf(
        OneToOneConversationMessagesNotReplicatedError,
      );
      expect(pinRepository.pin).not.toHaveBeenCalled();
      expect(pinRepository.unpin).not.toHaveBeenCalled();
      expect(pinRepository.findByConversation).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    },
  );
});
