import ConversationMessageRegistrar from '@app/contexts/conversations/application/register-message/ConversationMessageRegistrar';
import { RegisterConversationMessage } from '@app/contexts/conversations/application/register-message/messages/RegisterConversationMessage';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { InvalidMessageSignatureError } from '@app/contexts/conversations/domain/errors/InvalidMessageSignatureError';
import { RemoteMessageCandidateMismatchError } from '@app/contexts/conversations/domain/errors/RemoteMessageCandidateMismatchError';
import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageSignatureDomainService } from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '@app/contexts/conversations/domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { Signature } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('ConversationMessageRegistrar', () => {
  let repository: MockProxy<ConversationRepository>;
  let signatureService: MockProxy<MessageSignatureDomainService>;
  let registrar: ConversationMessageRegistrar;
  let mother: ConversationMother;

  beforeEach(async () => {
    repository = mock<ConversationRepository>();
    signatureService = mock<MessageSignatureDomainService>();
    registrar = new ConversationMessageRegistrar(repository, signatureService);
    mother = await ConversationMother.create();
  });

  function buildCandidate(
    conversationId: ConversationId,
    messageId: MessageId,
  ): MessageSent {
    return MessageSent.create(
      conversationId,
      mother.author,
      new EncryptedMessagePayload('encrypted-payload'),
      new Signature(
        'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
      ),
      [],
      [],
      undefined,
      messageId,
    );
  }

  it('registers a remote candidate that matches the announced message', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const candidate = buildCandidate(conversationId, messageId);

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);
    signatureService.isValidSignature.mockReturnValue(true);

    await registrar.register(
      new RegisterConversationMessage(
        conversationId.valueOf(),
        messageId.valueOf(),
      ),
    );

    expect(signatureService.isValidSignature).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(conversation);
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

    expect(signatureService.isValidSignature).not.toHaveBeenCalled();
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

    expect(signatureService.isValidSignature).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a remote candidate with an invalid signature', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const candidate = buildCandidate(conversationId, messageId);

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);
    signatureService.isValidSignature.mockReturnValue(false);

    await expect(
      registrar.register(
        new RegisterConversationMessage(
          conversationId.valueOf(),
          messageId.valueOf(),
        ),
      ),
    ).rejects.toThrow(InvalidMessageSignatureError);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a remote candidate from a non participant', async () => {
    const conversation = mother.build();
    const conversationId = conversation.getId();
    const messageId = MessageId.generate();
    const outsider = await ConversationMother.generateIdentityId();
    const candidate = MessageSent.create(
      conversationId,
      outsider,
      new EncryptedMessagePayload('encrypted-payload'),
      new Signature(
        'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
      ),
      [],
      [],
      undefined,
      messageId,
    );

    repository.findById.mockResolvedValue(conversation);
    repository.findCandidateMessageById.mockResolvedValue(candidate);
    signatureService.isValidSignature.mockReturnValue(true);

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
