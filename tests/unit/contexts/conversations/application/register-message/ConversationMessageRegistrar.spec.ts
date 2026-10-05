import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { MessageMetadata } from '@app/contexts/conversations/domain/entities/messages/MessageMetadata';
import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { RemoteMessageCandidateMismatchError } from '@app/contexts/conversations/domain/errors/RemoteMessageCandidateMismatchError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';
import { messageProof } from '../../support/messageProof';

describe('ConversationMessageRegistrar', () => {
  let repository: MockProxy<ConversationRepository>;
  let registrar: ConversationMessageRegistrar;
  let mother: ConversationMother;

  beforeEach(async () => {
    repository = mock<ConversationRepository>();
    registrar = new ConversationMessageRegistrar(repository);
    mother = await ConversationMother.create();
  });

  function buildCandidate(
    conversationId: ConversationId,
    messageId: MessageId,
  ): MessageSent {
    return MessageSent.create(
      new MessageMetadata(
        messageId,
        conversationId,
        mother.author,
        [],
        Timestamp.now(),
      ),
      new EncryptedMessagePayload('encrypted-payload'),
    );
  }

  it('registers a remote candidate that matches the announced message', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const candidate = buildCandidate(conversationId, messageId);

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);

    await registrar.register(
      new RegisterConversationMessage(
        conversationId.valueOf(),
        messageId.valueOf(),
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(conversation, undefined);
    expect(conversation.toPrimitives().messages).toHaveLength(1);
  });

  it('does not duplicate already registered messages', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const candidate = buildCandidate(conversationId, messageId);

    conversation.registerMessage(candidate);
    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);

    await registrar.register(
      new RegisterConversationMessage(
        conversationId.valueOf(),
        messageId.valueOf(),
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(conversation, undefined);
    expect(conversation.toPrimitives().messages).toHaveLength(1);
  });

  it('rejects a remote candidate with a different message id', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const announcedMessageId = MessageId.generate();
    const candidate = buildCandidate(conversationId, MessageId.generate());

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);

    await expect(
      registrar.register(
        new RegisterConversationMessage(
          conversationId.valueOf(),
          announcedMessageId.valueOf(),
        ),
      ),
    ).rejects.toThrow(RemoteMessageCandidateMismatchError);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a remote candidate with a different conversation id', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const candidate = buildCandidate(
      new ConversationId('one-to-one:malicious-conversation'),
      messageId,
    );

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);

    await expect(
      registrar.register(
        new RegisterConversationMessage(
          conversationId.valueOf(),
          messageId.valueOf(),
        ),
      ),
    ).rejects.toThrow(RemoteMessageCandidateMismatchError);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('persists an announced message with the proof it carried', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const candidate = buildCandidate(conversationId, messageId);
    const proof = messageProof(messageId.valueOf());

    repository.findById.mockResolvedValue(conversation);

    await registrar.registerCandidate(
      new RegisterConversationMessage(
        conversationId.valueOf(),
        messageId.valueOf(),
        proof.toPrimitives(),
      ),
      candidate,
    );

    expect(repository.save).toHaveBeenCalledWith(
      conversation,
      new Map([[messageId.valueOf(), expect.objectContaining({})]]),
    );
  });

  it('rejects a remote candidate from a non participant', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const outsider = await ConversationMother.generateIdentityId();
    const candidate = MessageSent.create(
      new MessageMetadata(
        messageId,
        conversationId,
        outsider,
        [],
        Timestamp.now(),
      ),
      new EncryptedMessagePayload('encrypted-payload'),
    );

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);

    await expect(
      registrar.register(
        new RegisterConversationMessage(
          conversationId.valueOf(),
          messageId.valueOf(),
        ),
      ),
    ).rejects.toThrow(ConversationParticipantNotFoundError);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
